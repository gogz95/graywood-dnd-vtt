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

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from(file_bytes))
        .unwrap())
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
