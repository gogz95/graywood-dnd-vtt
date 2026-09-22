use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Scaffold Report types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubdirStatus {
    pub path: String,
    pub existed: bool,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriagedFile {
    pub filename: String,
    pub destination: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaffoldReport {
    pub root_path: String,
    pub subdirs: Vec<SubdirStatus>,
    pub triaged: Vec<TriagedFile>,
    pub triage_errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyScaffoldRequest {
    pub root_path: String,
}

/// POST /api/campaign/directory/verify-scaffold
/// Ensures all required subdirectories exist (creating any missing ones) and
/// moves loose files sitting directly in root_path into the appropriate subdir.
pub async fn verify_and_scaffold_campaign(
    Json(payload): Json<VerifyScaffoldRequest>,
) -> Result<Json<ScaffoldReport>, ServerError> {
    let root = PathBuf::from(&payload.root_path);
    if !root.exists() {
        return Err(ServerError::BadRequest(format!(
            "Root path does not exist: {}",
            payload.root_path
        )));
    }

    let required_subdirs = [
        "Ingest/Source material",
        "Ingest/Image",
        "Ingest/Audio",
        "Ingest/Video",
        "maps",
        "tokens",
        "audio",
    ];

    let mut subdirs: Vec<SubdirStatus> = Vec::new();
    for rel in &required_subdirs {
        let full = root.join(rel);
        let existed = full.exists();
        let created = if !existed {
            std::fs::create_dir_all(&full)
                .map(|_| true)
                .unwrap_or(false)
        } else {
            false
        };
        subdirs.push(SubdirStatus {
            path: rel.to_string(),
            existed,
            created,
        });
    }

    // Triage loose files directly in root_path (non-recursive, files only)
    let mut triaged: Vec<TriagedFile> = Vec::new();
    let mut triage_errors: Vec<String> = Vec::new();

    let read_dir = std::fs::read_dir(&root)
        .map_err(|e| ServerError::Internal(format!("Failed to read root dir: {}", e)))?;

    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let dest_rel: Option<&str> = match ext.as_str() {
            "pdf" | "md" | "txt" | "docx" => Some("Ingest/Source material"),
            "png" | "jpg" | "jpeg" | "webp" | "svg" => Some("Ingest/Image"),
            "mp3" | "wav" | "ogg" | "flac" => Some("Ingest/Audio"),
            "mp4" | "webm" => Some("Ingest/Video"),
            _ => None,
        };

        if let Some(dest_rel) = dest_rel {
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let dest_dir = root.join(dest_rel);
            let dest_path = dest_dir.join(&filename);

            match std::fs::rename(&path, &dest_path) {
                Ok(()) => triaged.push(TriagedFile {
                    filename,
                    destination: dest_rel.to_string(),
                }),
                Err(e) => {
                    // rename may fail across volumes – fall back to copy + delete
                    match std::fs::copy(&path, &dest_path) {
                        Ok(_) => {
                            let _ = std::fs::remove_file(&path);
                            triaged.push(TriagedFile {
                                filename,
                                destination: dest_rel.to_string(),
                            });
                        }
                        Err(ce) => {
                            triage_errors.push(format!(
                                "Failed to move '{}': rename={}, copy={}",
                                path.display(),
                                e,
                                ce
                            ));
                        }
                    }
                }
            }
        }
    }

    Ok(Json(ScaffoldReport {
        root_path: root.to_string_lossy().to_string(),
        subdirs,
        triaged,
        triage_errors,
        subdirs,
        triaged,
        triage_errors,
    }
        subdirs,
        triaged,
        triage_errors,
    }))

    }))
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubfolderStats {
    pub name: String,
    pub path: String,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignDirInfo {
    pub root_path: String,
    pub name: String,
    pub subfolders: Vec<SubfolderStats>,
}

#[derive(Debug, Deserialize)]
pub struct SetDirectoryRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveAssetRequest {
    pub subfolder: String, // 'maps' | 'audio' | 'compendiums' | 'tokens'
    pub filename: String,
    pub data_base64: String,
}

/// Helper to sanitize a relative path and prevent directory traversal attacks (..).
pub fn sanitize_rel_path(rel_path: &str) -> Result<PathBuf, ServerError> {
    let path = Path::new(rel_path);
    for comp in path.components() {
        match comp {
            std::path::Component::Normal(_) => {}
            _ => {
                return Err(ServerError::BadRequest(
                    "Invalid path: directory traversal or absolute paths forbidden".to_string(),
                ));
            }
        }
    }
    Ok(path.to_path_buf())
}

/// Scaffolds standard subfolders (maps, audio, compendiums, tokens, Ingest) inside a given directory.
pub fn scaffold_campaign_directory(root: &Path) -> Result<CampaignDirInfo, ServerError> {
    let subfolder_names = ["maps", "audio", "compendiums", "tokens", "Ingest"];
    let mut subfolders = Vec::new();

    for name in &subfolder_names {
        let sub_path = root.join(name);
        std::fs::create_dir_all(&sub_path).map_err(|e| {
            ServerError::Internal(format!("Failed to create subfolder '{}': {}", name, e))
        })?;

        let file_count = match std::fs::read_dir(&sub_path) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .count(),
            Err(_) => 0,
        };

        subfolders.push(SubfolderStats {
            name: name.to_string(),
            path: sub_path.to_string_lossy().to_string(),
            file_count,
        });
    }

    // Auto-scaffold Ingest subdirectories: Source material, Image, Audio, Video
    let ingest_subfolders = [
        "Ingest/Source material",
        "Ingest/Image",
        "Ingest/Audio",
        "Ingest/Video",
    ];
    for sub in &ingest_subfolders {
        let sub_path = root.join(sub);
        let _ = std::fs::create_dir_all(&sub_path);
    }

    let dir_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Campaign".to_string());

    Ok(CampaignDirInfo {
        root_path: root.to_string_lossy().to_string(),
        name: dir_name,
        subfolders,
    })
}

/// GET /api/campaign/directory/current - Get current campaign directory info if configured.
pub async fn get_current_directory(
    State(state): State<AppState>,
) -> Result<Json<Option<CampaignDirInfo>>, ServerError> {
    let guard = state.campaign_dir.read().await;
    if let Some(ref dir) = *guard {
        if dir.exists() {
            let info = scaffold_campaign_directory(dir)?;
            return Ok(Json(Some(info)));
        }
    }
    Ok(Json(None))
}

/// POST /api/campaign/directory/select - Open native desktop folder dialog, scaffold subfolders, and store path.
pub async fn select_campaign_directory(
    State(state): State<AppState>,
) -> Result<Json<Option<CampaignDirInfo>>, ServerError> {
    let folder_handle = rfd::AsyncFileDialog::new()
        .set_title("Select or Create Campaign Directory")
        .pick_folder()
        .await;

    let root_path = match folder_handle {
        Some(handle) => handle.path().to_path_buf(),
        None => return Ok(Json(None)), // user cancelled
    };

    let info = scaffold_campaign_directory(&root_path)?;
    {
        let mut guard = state.campaign_dir.write().await;
        *guard = Some(root_path);
    }

    Ok(Json(Some(info)))
}

/// POST /api/campaign/directory/set - Manually set campaign directory path, scaffold subfolders.
pub async fn set_campaign_directory(
    State(state): State<AppState>,
    Json(payload): Json<SetDirectoryRequest>,
) -> Result<Json<CampaignDirInfo>, ServerError> {
    let path = PathBuf::from(&payload.path);
    std::fs::create_dir_all(&path)
        .map_err(|e| ServerError::Internal(format!("Failed to create directory: {}", e)))?;

    let info = scaffold_campaign_directory(&path)?;
    {
        let mut guard = state.campaign_dir.write().await;
        *guard = Some(path);
    }

    Ok(Json(info))
}

/// GET /api/campaign/assets/*path - Stream asset file safely from the active campaign directory.
pub async fn serve_campaign_asset(
    State(state): State<AppState>,
    AxumPath(rel_path): AxumPath<String>,
) -> Result<Response, ServerError> {
    let safe_rel = sanitize_rel_path(&rel_path)?;

    let guard = state.campaign_dir.read().await;
    let root = match *guard {
        Some(ref dir) => dir.clone(),
        None => {
            return Err(ServerError::NotFound(
                "No campaign directory configured".to_string(),
            ))
        }
    };

    let target_path = root.join(&safe_rel);

    // Canonical verification to prevent symlink and relative path traversal
    let canonical_root = root
        .canonicalize()
        .map_err(|e| ServerError::Internal(format!("Failed to resolve campaign root: {}", e)))?;
    let canonical_target = target_path
        .canonicalize()
        .map_err(|_| ServerError::NotFound(format!("Asset not found: {}", rel_path)))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err(ServerError::Unauthorized(
            "Path traversal denied".to_string(),
        ));
    }

    let file_bytes = std::fs::read(&canonical_target)
        .map_err(|e| ServerError::NotFound(format!("Failed to read asset: {}", e)))?;

    let mime = mime_guess::from_path(&canonical_target)
        .first_or_octet_stream()
        .to_string();

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use tauri::Manager;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubfolderStats {
    pub name: String,
    pub size_bytes: u64,
    pub file_count: usize,
}


pub async fn get_campaign_subfolders(
    State(app_handle): State<tauri::AppHandle>,
) -> Result<Json<Vec<SubfolderStats>>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let mut stats = Vec::new();
    let subfolders = vec![''maps'', ''audio'', ''tokens'', ''portraits'', ''data''];

    for folder in subfolders {
        let folder_path = app_dir.join(folder);
        let mut size_bytes = 0;
        let mut file_count = 0;

        if folder_path.exists() && folder_path.is_dir() {
            let entries = walkdir::WalkDir::new(&folder_path)
                .into_iter()
                .filter_map(|e| e.ok());

            for entry in entries {
                if entry.file_type().is_file() {
                    file_count += 1;
                    if let Ok(metadata) = entry.metadata() {
                        size_bytes += metadata.len();
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


pub async fn get_campaign_subfolders(
    State(app_handle): State<tauri::AppHandle>,
) -> Result<Json<Vec<SubfolderStats>>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let mut stats = Vec::new();
    let subfolders = vec![''maps'', ''audio'', ''tokens'', ''portraits'', ''data''];

    for folder in subfolders {
        let folder_path = app_dir.join(folder);
        let mut size_bytes = 0;
        let mut file_count = 0;

        if folder_path.exists() && folder_path.is_dir() {
            let entries = walkdir::WalkDir::new(&folder_path)
                .into_iter()
                .filter_map(|e| e.ok());

            for entry in entries {
                if entry.file_type().is_file() {
                    file_count += 1;
                    if let Ok(metadata) = entry.metadata() {
                        size_bytes += metadata.len();
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

        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from(file_bytes))
        .map_err(|e| ServerError::Internal(format!("Failed to build response: {}", e)))
}

/// POST /api/campaign/assets/save - Save an uploaded asset to a specific campaign subfolder safely.
pub async fn save_campaign_asset(
    State(state): State<AppState>,
    Json(payload): Json<SaveAssetRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let allowed_subfolders = ["maps", "audio", "compendiums", "tokens", "Ingest"];
    if !allowed_subfolders.contains(&payload.subfolder.as_str()) {
        return Err(ServerError::BadRequest(format!(
            "Invalid subfolder '{}'. Must be one of: maps, audio, compendiums, tokens, Ingest",
            payload.subfolder
        )));
    }

    let safe_filename = sanitize_rel_path(&payload.filename)?;
    let raw_bytes = hex::decode(&payload.data_base64)
        .or_else(|_| {
            use std::io::Read;
            // Try standard base64 decoding if not hex
            let mut cursor = std::io::Cursor::new(&payload.data_base64);
            let mut out = Vec::new();
            cursor.read_to_end(&mut out).map(|_| out)
        })
        .map_err(|e| ServerError::BadRequest(format!("Failed to decode payload: {}", e)))?;

    let guard = state.campaign_dir.read().await;
    let root = match *guard {
        Some(ref dir) => dir.clone(),
        None => {
            return Err(ServerError::BadRequest(
                "No campaign directory configured".to_string(),
            ))
        }
    };

    let target_dir = root.join(&payload.subfolder);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| ServerError::Internal(format!("Failed to create subfolder: {}", e)))?;

    let file_path = target_dir.join(&safe_filename);
    std::fs::write(&file_path, &raw_bytes)
        .map_err(|e| ServerError::Internal(format!("Failed to write file: {}", e)))?;

    let public_url = format!(
        "/api/campaign/assets/{}/{}",
        payload.subfolder, payload.filename
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "path": file_path.to_string_lossy(),
        "url": public_url
    })))
}

#[derive(Debug, Deserialize)]
pub struct ScanIngestRequest {
    pub path: Option<String>,
}

/// POST /api/campaign/ingest/scan - Scan Ingest directory or selected folder asynchronously
pub async fn scan_ingest_directory_route(
    State(state): State<AppState>,
    payload: Option<Json<ScanIngestRequest>>,
) -> Result<Json<crate::commands::IngestScanResult>, ServerError> {
    let target = match payload.and_then(|p| p.0.path) {
        Some(p) if !p.trim().is_empty() => Some(p),
        _ => {
            let guard = state.campaign_dir.read().await;
            guard.as_ref().map(|d| d.to_string_lossy().to_string())
        }
    };

    crate::commands::scan_ingest_directory(target)
        .await
        .map(Json)
        .map_err(ServerError::Internal)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignAssetEntry {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub relative_path: String,
    pub url: String,
    pub category: String, // "map" | "token" | "prop" | "handout"
    pub size_bytes: u64,
    pub extension: String,
}

/// Scan campaign root for raster image assets across maps/, tokens/, and Ingest/Image/.
pub async fn list_campaign_assets(root: &Path) -> Vec<CampaignAssetEntry> {
    let subdirs = ["maps", "tokens", "Ingest/Image", "Ingest/image"];
    let valid_extensions = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"];
    let mut entries = Vec::new();

    for subdir in &subdirs {
        let dir_path = root.join(subdir);
        if !dir_path.exists() {
            continue;
        }

        let mut dirs_to_visit = vec![dir_path];
        while let Some(current_dir) = dirs_to_visit.pop() {
            let mut read_dir = match tokio::fs::read_dir(&current_dir).await {
                Ok(rd) => rd,
                Err(_) => continue,
            };

            while let Ok(Some(entry)) = read_dir.next_entry().await {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                if file_name.starts_with('.') {
                    continue;
                }

                let file_type = match entry.file_type().await {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };

                if file_type.is_dir() {
                    dirs_to_visit.push(path);
                } else if file_type.is_file() {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if !valid_extensions.contains(&ext.as_str()) {
                        continue;
                    }

                    let rel_path = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");

                    let size_bytes = entry.metadata().await.map(|m| m.len()).unwrap_or(0);

                    // Categorize asset
                    let lower_rel = rel_path.to_lowercase();
                    let lower_name = file_name.to_lowercase();
                    let category = if lower_rel.starts_with("maps") || lower_name.contains("map") {
                        "map"
                    } else if lower_name.contains("prop") {
                        "prop"
                    } else if lower_name.contains("handout") {
                        "handout"
                    } else if lower_rel.starts_with("tokens") || lower_name.contains("token") {
                        "token"
                    } else {
                        "image"
                    };

                    let base_stem = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&file_name)
                        .replace(['_', '-'], " ");

                    let url = format!("/api/campaign/assets/{}", rel_path);

                    entries.push(CampaignAssetEntry {
                        id: format!("asset-{}", rel_path.replace(['/', '\\', '.'], "-")),
                        name: base_stem,
                        filename: file_name,
                        relative_path: rel_path,
                        url,
                        category: category.to_string(),
                        size_bytes,
                        extension: ext,
                    });
                }
            }
        }
    }

    entries
}

/// GET /api/campaign/assets/browse - List indexed raster images from campaign folders.
pub async fn list_campaign_assets_route(
    State(state): State<AppState>,
) -> Result<Json<Vec<CampaignAssetEntry>>, ServerError> {
    let guard = state.campaign_dir.read().await;
    let root = match *guard {
        Some(ref dir) => dir.clone(),
        None => return Ok(Json(Vec::new())),
    };

    let assets = list_campaign_assets(&root).await;
    Ok(Json(assets))
}
