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
    let subfolders = vec!["maps", "audio", "tokens", "portraits", "data"];

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
