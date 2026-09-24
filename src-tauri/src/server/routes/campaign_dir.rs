use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path as StdPath, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::server::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubfolderStats {
    pub name: String,
    pub size_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CampaignDirResponse {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetCampaignDirRequest {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CampaignDirStatusResponse {
    pub path: Option<String>,
    pub exists: bool,
    pub is_directory: bool,
    pub accessible: bool,
}

pub async fn get_current_directory(
    State(state): State<AppState>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    let guard = state.campaign_dir.read().await;
    let path = guard.as_ref().map(|p| p.to_string_lossy().to_string());
    Ok(Json(CampaignDirResponse { path }))
}

pub async fn select_campaign_directory(
    State(_state): State<AppState>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    Ok(Json(CampaignDirResponse { path: None }))
}

pub async fn set_campaign_directory(
    State(state): State<AppState>,
    Json(payload): Json<SetCampaignDirRequest>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    let p = std::path::PathBuf::from(&payload.path);
    if p.exists() && p.is_dir() {
        *state.campaign_dir.write().await = Some(p);
        Ok(Json(CampaignDirResponse {
            path: Some(payload.path),
        }))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn get_campaign_directory_status(
    State(state): State<AppState>,
) -> Result<Json<CampaignDirStatusResponse>, StatusCode> {
    let guard = state.campaign_dir.read().await;
    if let Some(ref path) = *guard {
        let exists = path.exists();
        let is_directory = path.is_dir();
        let accessible = exists && is_directory && std::fs::read_dir(path).is_ok();
        Ok(Json(CampaignDirStatusResponse {
            path: Some(path.to_string_lossy().to_string()),
            exists,
            is_directory,
            accessible,
        }))
    } else {
        Ok(Json(CampaignDirStatusResponse {
            path: None,
            exists: false,
            is_directory: false,
            accessible: false,
        }))
    }
}

pub async fn list_campaign_assets_route(
    State(state): State<AppState>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let guard = state.campaign_dir.read().await;
    let base_dir = guard.clone().unwrap_or_else(|| state.assets_dir.clone());
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&base_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Ok(rel) = entry.path().strip_prefix(&base_dir) {
                files.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    Ok(Json(files))
}

pub async fn serve_campaign_asset(
    State(state): State<AppState>,
    Path(path): Path<String>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let guard = state.campaign_dir.read().await;
    let base_dir = guard.clone().unwrap_or_else(|| state.assets_dir.clone());
    let full_path = base_dir.join(&path);

    if !full_path.exists() || !full_path.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    match std::fs::read(&full_path) {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&full_path)
                .first_or_octet_stream()
                .to_string();
            let mut headers = axum::http::HeaderMap::new();
            if let Ok(val) = axum::http::HeaderValue::from_str(&mime) {
                headers.insert(axum::http::header::CONTENT_TYPE, val);
            }
            Ok((headers, bytes))
        }
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveAssetRequest {
    pub subfolder: String,
    pub filename: String,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
pub struct SaveAssetResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    const B64_CHARS: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [255u8; 256];
    for (i, &c) in B64_CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| b != b'=' && !b.is_ascii_whitespace())
        .collect();
    let mut output = Vec::with_capacity(clean.len() * 3 / 4);
    let mut i = 0;
    while i < clean.len() {
        let b0 = table[clean[i] as usize];
        if b0 == 255 {
            return Err("Invalid character".into());
        }
        let b1 = if i + 1 < clean.len() {
            table[clean[i + 1] as usize]
        } else {
            0
        };
        if b1 == 255 {
            return Err("Invalid character".into());
        }
        output.push((b0 << 2) | (b1 >> 4));
        if i + 2 < clean.len() {
            let b2 = table[clean[i + 2] as usize];
            if b2 == 255 {
                return Err("Invalid character".into());
            }
            output.push(((b1 & 0x0F) << 4) | (b2 >> 2));
            if i + 3 < clean.len() {
                let b3 = table[clean[i + 3] as usize];
                if b3 == 255 {
                    return Err("Invalid character".into());
                }
                output.push(((b2 & 0x03) << 6) | b3);
            }
        }
        i += 4;
    }
    Ok(output)
}

pub async fn save_campaign_asset(
    State(state): State<AppState>,
    Json(payload): Json<SaveAssetRequest>,
) -> Result<Json<SaveAssetResponse>, StatusCode> {
    let guard = state.campaign_dir.read().await;
    let base_dir = guard.clone().unwrap_or_else(|| state.assets_dir.clone());
    let target_dir = base_dir.join(&payload.subfolder);
    if let Err(e) = std::fs::create_dir_all(&target_dir) {
        return Ok(Json(SaveAssetResponse {
            success: false,
            url: None,
            error: Some(format!("Failed to create folder: {}", e)),
        }));
    }

    let clean_b64 = if let Some(idx) = payload.data_base64.find(',') {
        &payload.data_base64[idx + 1..]
    } else {
        &payload.data_base64
    };

    let bytes = match decode_base64(clean_b64.trim()) {
        Ok(b) => b,
        Err(e) => {
            return Ok(Json(SaveAssetResponse {
                success: false,
                url: None,
                error: Some(format!("Invalid base64 payload: {}", e)),
            }));
        }
    };

    let file_path = target_dir.join(&payload.filename);
    if let Err(e) = std::fs::write(&file_path, bytes) {
        return Ok(Json(SaveAssetResponse {
            success: false,
            url: None,
            error: Some(format!("Failed to write file: {}", e)),
        }));
    }

    let url = format!(
        "/api/campaign/assets/{}/{}",
        payload.subfolder, payload.filename
    );
    Ok(Json(SaveAssetResponse {
        success: true,
        url: Some(url),
        error: None,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ScanIngestRequest {
    pub path: Option<String>,
}

pub async fn scan_ingest_directory_route(
    State(state): State<AppState>,
    Json(payload): Json<ScanIngestRequest>,
) -> Result<Json<crate::commands::IngestScanResult>, StatusCode> {
    let target = match payload.path {
        Some(p) if !p.trim().is_empty() => Some(p),
        _ => {
            let guard = state.campaign_dir.read().await;
            guard.as_ref().map(|p| p.to_string_lossy().to_string())
        }
    };
    match crate::commands::scan_ingest_directory(target).await {
        Ok(res) => Ok(Json(res)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[derive(Debug, Deserialize)]
pub struct VerifyScaffoldRequest {
    pub root_path: String,
    #[serde(default)]
    pub seed_srd: bool,
}

#[derive(Debug, Serialize)]
pub struct SubdirStatus {
    pub path: String,
    pub existed: bool,
    pub created: bool,
}

#[derive(Debug, Serialize)]
pub struct TriagedFile {
    pub filename: String,
    pub destination: String,
}

#[derive(Debug, Serialize)]
pub struct ScaffoldReport {
    pub root_path: String,
    pub subdirs: Vec<SubdirStatus>,
    pub triaged: Vec<TriagedFile>,
    pub triage_errors: Vec<String>,
}

pub async fn verify_and_scaffold_campaign(
    State(state): State<AppState>,
    Json(payload): Json<VerifyScaffoldRequest>,
) -> Result<Json<ScaffoldReport>, StatusCode> {
    let root = std::path::PathBuf::from(&payload.root_path);
    if std::fs::create_dir_all(&root).is_err() {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    *state.campaign_dir.write().await = Some(root.clone());

    let required = vec![
        "Ingest/Source material",
        "Ingest/Image",
        "Ingest/Audio",
        "Ingest/Video",
        "maps",
        "tokens",
        "audio",
        "journal",
    ];

    let mut subdirs = Vec::new();
    for rel in required {
        let p = root.join(rel);
        let existed = p.exists();
        let mut created = false;
        if !existed && std::fs::create_dir_all(&p).is_ok() {
            created = true;
        }
        subdirs.push(SubdirStatus {
            path: rel.to_string(),
            existed,
            created,
        });
    }

    Ok(Json(ScaffoldReport {
        root_path: payload.root_path,
        subdirs,
        triaged: vec![],
        triage_errors: vec![],
    }))
}

pub async fn get_campaign_subfolders(
    State(state): State<AppState>,
) -> Result<Json<Vec<SubfolderStats>>, String> {
    let app_dir = state
        .campaign_dir
        .read()
        .await
        .clone()
        .unwrap_or_else(|| state.assets_dir.clone());

    let mut stats = Vec::new();
    let subfolders = vec!["maps", "audio", "tokens", "portraits", "data", "journal"];

    for folder in subfolders {
        let folder_path = app_dir.join(folder);
        let mut size_bytes = 0;
        let mut file_count = 0;

        if folder_path.exists() && folder_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&folder_path) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            file_count += 1;
                            size_bytes += meta.len();
                        }
                    }
                }
            }
        }

        stats.push(SubfolderStats {
            name: folder.to_string(),
            size_bytes,
            file_count,
        });
    }

    Ok(Json(stats))
}

// ── Campaign Archival Engine (.gvtt bundles) ─────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ExportCampaignBundleRequest {
    pub output_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportCampaignBundleResponse {
    pub success: bool,
    pub message: String,
    pub archive_path: String,
    pub file_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct ImportCampaignBundleRequest {
    pub archive_path: Option<String>,
    pub archive_base64: Option<String>,
    pub target_campaign_name: Option<String>,
    pub target_directory: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportCampaignBundleResponse {
    pub success: bool,
    pub message: String,
    pub active_campaign_dir: String,
    pub files_extracted: usize,
    pub characters_restored: usize,
}

fn add_tree_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    dir: &StdPath,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut count = 0;
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        let zip_path = if prefix.is_empty() {
            file_name_str.to_string()
        } else {
            format!("{}/{}", prefix, file_name_str)
        };

        if path.is_dir() {
            count += add_tree_to_zip(zip, &path, &zip_path, options)?;
        } else if path.is_file() {
            zip.start_file(&zip_path, options)
                .map_err(|e| format!("Zip error starting file '{}': {}", zip_path, e))?;
            let mut file = File::open(&path)
                .map_err(|e| format!("Failed opening file '{:?}': {}", path, e))?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)
                .map_err(|e| format!("Failed reading file: {}", e))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("Failed writing file to zip: {}", e))?;
            count += 1;
        }
    }

    Ok(count)
}

/// POST /api/campaign/export
/// Bundles active campaign folder (`maps/`, `tokens/`, `audio/`, `journal/`, `Ingest/`) into a compressed `.gvtt`
/// archive along with a sanitized SQLite `db_dump.json` in the root of the archive.
pub async fn export_campaign_bundle(
    State(state): State<AppState>,
    Json(payload): Json<ExportCampaignBundleRequest>,
) -> Result<Json<ExportCampaignBundleResponse>, (StatusCode, String)> {
    let guard = state.campaign_dir.read().await;
    let base_dir = guard.clone().unwrap_or_else(|| state.assets_dir.clone());
    drop(guard);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let default_filename = format!("campaign_backup_{}.gvtt", timestamp);
    let target_path_buf = if let Some(ref path_str) = payload.output_path {
        let mut p = PathBuf::from(path_str);
        if p.is_dir() {
            p = p.join(&default_filename);
        } else if p.extension().is_none() {
            p.set_extension("gvtt");
        }
        p
    } else {
        let backups_dir = PathBuf::from("./backups");
        let _ = std::fs::create_dir_all(&backups_dir);
        backups_dir.join(&default_filename)
    };

    if let Some(parent) = target_path_buf.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let file = File::create(&target_path_buf)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create export file: {}", e)))?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let mut total_files = 0;

    // 1. Export active campaign directories: maps, tokens, audio, journal, Ingest
    let folders_to_bundle = ["maps", "tokens", "audio", "journal", "Ingest", "portraits"];
    for folder in &folders_to_bundle {
        let folder_path = base_dir.join(folder);
        if folder_path.exists() && folder_path.is_dir() {
            let count = add_tree_to_zip(&mut zip, &folder_path, folder, options)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
            total_files += count;
        }
    }

    // 2. Dump SQLite tables to sanitized db_dump.json
    let conn = state.db.lock().await;

    // Dump characters
    let mut characters_json = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, pin, current_hp, max_hp, temp_hp, hit_dice_current, hit_dice_max, base_ac, speed, passive_perception, spell_slots_json, inventory_json, is_orb_sealed, resurrection_sickness_penalty FROM characters") {
        if let Ok(char_rows) = stmt.query_map([], |row| {
            let is_sealed: i32 = row.get(13)?;
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "pin": row.get::<_, String>(2)?,
                "current_hp": row.get::<_, i32>(3)?,
                "max_hp": row.get::<_, i32>(4)?,
                "temp_hp": row.get::<_, i32>(5)?,
                "hit_dice_current": row.get::<_, i32>(6)?,
                "hit_dice_max": row.get::<_, i32>(7)?,
                "base_ac": row.get::<_, i32>(8)?,
                "speed": row.get::<_, i32>(9)?,
                "passive_perception": row.get::<_, i32>(10)?,
                "spell_slots_json": row.get::<_, String>(11)?,
                "inventory_json": row.get::<_, String>(12)?,
                "is_orb_sealed": is_sealed != 0,
                "resurrection_sickness_penalty": row.get::<_, i32>(14)?,
            }))
        }) {
            for char_obj in char_rows.flatten() {
                characters_json.push(char_obj);
            }
        }
    }

    // Dump encounters
    let mut encounters_json = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, round, current_turn_index, is_active, created_at FROM encounters") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let is_active: i32 = row.get(4)?;
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "round": row.get::<_, i32>(2)?,
                "current_turn_index": row.get::<_, i32>(3)?,
                "is_active": is_active != 0,
                "created_at": row.get::<_, i64>(5)?,
            }))
        }) {
            for enc in rows.flatten() {
                encounters_json.push(enc);
            }
        }
    }

    // Dump campaign_state (calendar)
    let mut campaign_state_json = serde_json::Value::Null;
    if let Ok(mut stmt) = conn.prepare("SELECT id, epoch_days, current_epoch_seconds, updated_at FROM campaign_state WHERE id = 'global'") {
        if let Ok(mut rows) = stmt.query([]) {
            if let Ok(Some(row)) = rows.next() {
                campaign_state_json = serde_json::json!({
                    "id": row.get::<_, String>(0).unwrap_or_default(),
                    "epoch_days": row.get::<_, i64>(1).unwrap_or(0),
                    "current_epoch_seconds": row.get::<_, i64>(2).unwrap_or(0),
                    "updated_at": row.get::<_, i64>(3).unwrap_or(0),
                });
            }
        }
    }

    drop(conn);

    let campaign_name = state.companion_hub.campaign_name.read().await.clone();

    let db_dump = serde_json::json!({
        "format": "gvtt_campaign_bundle",
        "version": "1.0.0",
        "campaign_name": campaign_name,
        "exported_at": timestamp,
        "characters": characters_json,
        "encounters": encounters_json,
        "campaign_state": campaign_state_json,
    });

    let db_dump_bytes = serde_json::to_vec_pretty(&db_dump)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed serializing db_dump.json: {}", e)))?;

    zip.start_file("db_dump.json", options)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Zip error starting db_dump.json: {}", e)))?;
    zip.write_all(&db_dump_bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Zip error writing db_dump.json: {}", e)))?;
    total_files += 1;

    // 3. Write manifest.json
    let manifest = serde_json::json!({
        "generator": "Graywood VTT Campaign Archival Engine",
        "format": "gvtt",
        "version": "1.0.0",
        "created_at": timestamp,
        "bundled_folders": folders_to_bundle,
    });
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed serializing manifest.json: {}", e)))?;

    zip.start_file("manifest.json", options)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Zip error starting manifest.json: {}", e)))?;
    zip.write_all(&manifest_bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Zip error writing manifest.json: {}", e)))?;
    total_files += 1;

    zip.finish()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to finalize .gvtt archive: {}", e)))?;

    Ok(Json(ExportCampaignBundleResponse {
        success: true,
        message: format!("Successfully bundled campaign into '{}'", target_path_buf.display()),
        archive_path: target_path_buf.to_string_lossy().to_string(),
        file_count: total_files,
    }))
}

/// POST /api/campaign/import
/// Unpacks a .gvtt bundle into a new target campaign folder, validating that no directory traversal attacks occur,
/// rehydrates the SQLite database from db_dump.json, and sets the imported directory as active.
pub async fn import_campaign_bundle(
    State(state): State<AppState>,
    Json(payload): Json<ImportCampaignBundleRequest>,
) -> Result<Json<ImportCampaignBundleResponse>, (StatusCode, String)> {
    // 1. Resolve archive input: from file path or base64 payload
    let temp_archive_path = if let Some(ref archive_path) = payload.archive_path {
        let p = PathBuf::from(archive_path);
        if !p.exists() {
            return Err((StatusCode::NOT_FOUND, format!("Archive file '{}' not found", archive_path)));
        }
        p
    } else if let Some(ref b64) = payload.archive_base64 {
        let clean = if let Some(idx) = b64.find(',') {
            &b64[idx + 1..]
        } else {
            b64
        };
        let bytes = decode_base64(clean.trim())
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid base64 archive: {}", e)))?;
        let temp_path = std::env::temp_dir().join(format!("import_{}_{}.gvtt", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        std::fs::write(&temp_path, bytes)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write temp archive: {}", e)))?;
        temp_path
    } else {
        return Err((StatusCode::BAD_REQUEST, "Must provide 'archive_path' or 'archive_base64'".to_string()));
    };

    let archive_file = File::open(&temp_archive_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed opening archive: {}", e)))?;
    let mut zip = zip::ZipArchive::new(archive_file)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid zip archive: {}", e)))?;

    // 2. Resolve destination campaign directory
    let campaign_name = payload.target_campaign_name
        .clone()
        .unwrap_or_else(|| {
            let stem = temp_archive_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "imported_campaign".to_string());
            stem.replace("campaign_backup_", "Campaign ")
        });

    let target_dir = if let Some(ref dir) = payload.target_directory {
        PathBuf::from(dir)
    } else {
        let safe_name = campaign_name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
        PathBuf::from("./campaigns").join(safe_name)
    };

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed creating campaign folder '{}': {}", target_dir.display(), e)))?;

    let canonical_target = target_dir.canonicalize()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to canonicalize target dir: {}", e)))?;

    let mut files_extracted = 0;
    let mut db_dump_data: Option<serde_json::Value> = None;

    // 3. Extract all files with strict directory traversal prevention
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Zip read error: {}", e)))?;

        let raw_name = entry.name().to_string();

        // Enforce anti-traversal check
        if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.starts_with('\\') {
            return Err((StatusCode::BAD_REQUEST, format!("Directory traversal attack detected in entry '{}'", raw_name)));
        }

        if raw_name == "db_dump.json" {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed reading db_dump.json: {}", e)))?;
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&buf) {
                db_dump_data = Some(json);
            }
            continue;
        }

        let out_path = canonical_target.join(&raw_name);

        // Double check out_path stays inside canonical_target
        if !out_path.starts_with(&canonical_target) {
            return Err((StatusCode::BAD_REQUEST, format!("Invalid entry path escapes target: '{}'", raw_name)));
        }

        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&out_path);
        } else {
            if let Some(parent) = out_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let mut out_file = File::create(&out_path)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed creating extracted file: {}", e)))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed extracting file '{}': {}", raw_name, e)))?;
            files_extracted += 1;
        }
    }

    // 4. Rehydrate SQLite tables from db_dump.json
    let mut restored_chars = 0;
    if let Some(dump) = db_dump_data {
        let conn = state.db.lock().await;

        if let Some(chars) = dump.get("characters").and_then(|c| c.as_array()) {
            for c in chars {
                let id = c.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                let name = c.get("name").and_then(|v| v.as_str()).unwrap_or_default();
                let pin = c.get("pin").and_then(|v| v.as_str()).unwrap_or("1337");
                let current_hp = c.get("current_hp").and_then(|v| v.as_i64()).unwrap_or(10) as i32;
                let max_hp = c.get("max_hp").and_then(|v| v.as_i64()).unwrap_or(10) as i32;
                let temp_hp = c.get("temp_hp").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let hit_dice_current = c.get("hit_dice_current").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
                let hit_dice_max = c.get("hit_dice_max").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
                let base_ac = c.get("base_ac").and_then(|v| v.as_i64()).unwrap_or(10) as i32;
                let speed = c.get("speed").and_then(|v| v.as_i64()).unwrap_or(30) as i32;
                let passive_perception = c.get("passive_perception").and_then(|v| v.as_i64()).unwrap_or(10) as i32;
                let spell_slots_json = c.get("spell_slots_json").and_then(|v| v.as_str()).unwrap_or("{}");
                let inventory_json = c.get("inventory_json").and_then(|v| v.as_str()).unwrap_or("[]");
                let is_orb_sealed = if c.get("is_orb_sealed").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
                let resurrection_sickness = c.get("resurrection_sickness_penalty").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

                if !id.is_empty() && !name.is_empty() {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO characters (
                            id, name, pin, current_hp, max_hp, temp_hp,
                            hit_dice_current, hit_dice_max, base_ac, speed,
                            passive_perception, spell_slots_json, inventory_json,
                            is_orb_sealed, resurrection_sickness_penalty
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                        rusqlite::params![
                            id, name, pin, current_hp, max_hp, temp_hp,
                            hit_dice_current, hit_dice_max, base_ac, speed,
                            passive_perception, spell_slots_json, inventory_json,
                            is_orb_sealed, resurrection_sickness,
                        ],
                    );
                    restored_chars += 1;
                }
            }
        }

        if let Some(encs) = dump.get("encounters").and_then(|e| e.as_array()) {
            for enc in encs {
                let id = enc.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                let name = enc.get("name").and_then(|v| v.as_str()).unwrap_or("Restored Encounter");
                let round = enc.get("round").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
                let turn = enc.get("current_turn_index").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let is_active = if enc.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true) { 1 } else { 0 };
                let created_at = enc.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0);

                if !id.is_empty() {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO encounters (id, name, round, current_turn_index, is_active, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![id, name, round, turn, is_active, created_at],
                    );
                }
            }
        }

        if let Some(cs) = dump.get("campaign_state").and_then(|v| v.as_object()) {
            let epoch_days = cs.get("epoch_days").and_then(|v| v.as_i64()).unwrap_or(0);
            let epoch_secs = cs.get("current_epoch_seconds").and_then(|v| v.as_i64()).unwrap_or(0);
            let updated_at = cs.get("updated_at").and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute(
                "INSERT OR REPLACE INTO campaign_state (id, epoch_days, current_epoch_seconds, updated_at)
                 VALUES ('global', ?1, ?2, ?3)",
                rusqlite::params![epoch_days, epoch_secs, updated_at],
            );
        }

        if let Some(c_name) = dump.get("campaign_name").and_then(|v| v.as_str()) {
            *state.companion_hub.campaign_name.write().await = c_name.to_string();
        }

        drop(conn);
    }

    // 5. Set the imported directory as active campaign in AppState
    *state.campaign_dir.write().await = Some(target_dir.clone());

    Ok(Json(ImportCampaignBundleResponse {
        success: true,
        message: format!("Successfully imported campaign bundle into '{}'", target_dir.display()),
        active_campaign_dir: target_dir.to_string_lossy().to_string(),
        files_extracted,
        characters_restored: restored_chars,
    }))
}

