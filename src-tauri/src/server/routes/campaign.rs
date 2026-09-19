use crate::migrations::export_campaign_archive;
use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct ExportArchiveRequest {
    pub output_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportArchiveResponse {
    pub success: bool,
    pub message: String,
    pub archive_path: String,
}

/// POST /api/campaign/export
/// Triggers campaign disaster recovery backup, zipping `campaign.db`, asset directory,
/// and metadata manifest into a `.aleamos` archive file.
pub async fn export_archive(
    State(state): State<AppState>,
    Json(payload): Json<ExportArchiveRequest>,
) -> Result<Json<ExportArchiveResponse>, ServerError> {
    let out_path_str = payload.output_path.unwrap_or_else(|| {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("./backups/campaign_backup_{}.aleamos", timestamp)
    });

    let target_path = PathBuf::from(&out_path_str);

    // Default db path if not configured
    let db_path = Path::new("campaign.db");
    let assets_dir = &state.assets_dir;

    export_campaign_archive(db_path, assets_dir, &target_path)
        .map_err(|e| ServerError::Internal(format!("Failed to export campaign archive: {}", e)))?;

    Ok(Json(ExportArchiveResponse {
        success: true,
        message: "Campaign archive generated successfully.".to_string(),
        archive_path: out_path_str,
    }))
}
