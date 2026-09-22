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

pub async fn get_current_directory(
    State(_state): State<AppState>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    Ok(Json(CampaignDirResponse { path: None }))
}

pub async fn select_campaign_directory(
    State(_state): State<AppState>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    Ok(Json(CampaignDirResponse { path: None }))
}

pub async fn set_campaign_directory(
    State(_state): State<AppState>,
    Json(_payload): Json<SetCampaignDirRequest>,
) -> Result<Json<CampaignDirResponse>, StatusCode> {
    Ok(Json(CampaignDirResponse { path: None }))
}

pub async fn list_campaign_assets_route(
    State(_state): State<AppState>,
) -> Result<Json<Vec<String>>, StatusCode> {
    Ok(Json(vec![]))
}

pub async fn serve_campaign_asset(
    State(_state): State<AppState>,
    Path(_filename): Path<String>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::OK)
}

pub async fn save_campaign_asset(
    State(_state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::OK)
}

pub async fn scan_ingest_directory_route(
    State(_state): State<AppState>,
) -> Result<Json<Vec<String>>, StatusCode> {
    Ok(Json(vec![]))
}

pub async fn verify_and_scaffold_campaign(
    State(_state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::OK)
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
