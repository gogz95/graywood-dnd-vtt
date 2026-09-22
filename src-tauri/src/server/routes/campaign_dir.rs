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

/// Scaffolds standard subfolders (maps, audio, compendiums, tokens) inside a given directory.
pub fn scaffold_campaign_directory(root: &Path) -> Result<CampaignDirInfo, ServerError> {
    let subfolder_names = ["maps", "audio", "compendiums", "tokens"];
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

    // Canonical verification to prevent symlink traversal
    if let (Ok(canonical_root), Ok(canonical_target)) =
        (root.canonicalize(), target_path.canonicalize())
    {
        if !canonical_target.starts_with(&canonical_root) {
            return Err(ServerError::Unauthorized("Path traversal denied".to_string()));
        }
    } else if !target_path.exists() {
        return Err(ServerError::NotFound(format!("Asset not found: {}", rel_path)));
    }

    let file_bytes = std::fs::read(&target_path)
        .map_err(|e| ServerError::NotFound(format!("Failed to read asset: {}", e)))?;

    let mime = mime_guess::from_path(&target_path)
        .first_or_octet_stream()
        .to_string();

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .body(Body::from(file_bytes))
        .unwrap())
}

/// POST /api/campaign/assets/save - Save an uploaded asset to a specific campaign subfolder safely.
pub async fn save_campaign_asset(
    State(state): State<AppState>,
    Json(payload): Json<SaveAssetRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let allowed_subfolders = ["maps", "audio", "compendiums", "tokens"];
    if !allowed_subfolders.contains(&payload.subfolder.as_str()) {
        return Err(ServerError::BadRequest(format!(
            "Invalid subfolder '{}'. Must be one of: maps, audio, compendiums, tokens",
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

    let public_url = format!("/api/campaign/assets/{}/{}", payload.subfolder, payload.filename);

    Ok(Json(serde_json::json!({
        "success": true,
        "path": file_path.to_string_lossy(),
        "url": public_url
    })))
}
