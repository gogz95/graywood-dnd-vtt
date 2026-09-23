use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

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
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            files.push(entry.file_name().to_string_lossy().to_string());
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
    ];

    let mut subdirs = Vec::new();
    for rel in required {
        let p = root.join(rel);
        let existed = p.exists();
        let mut created = false;
        if !existed {
            if std::fs::create_dir_all(&p).is_ok() {
                created = true;
            }
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
    let subfolders = vec!["maps", "audio", "tokens", "portraits", "data"];

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
