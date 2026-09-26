// src-tauri/src/server/routes/plugins.rs
// Filesystem discovery and manifest validator for community plugins

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::server::state::AppState;

fn default_entrypoint() -> String {
    "index.js".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default = "default_entrypoint")]
    pub entrypoint: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredPlugin {
    pub manifest: PluginManifest,
    pub dir_name: String,
    pub code: String,
    pub folder_path: String,
}

/// Discover all plugins in the active campaign's `plugins/` directory or local `./plugins/`
pub fn scan_plugins_dir(base_dir: Option<&Path>) -> Vec<DiscoveredPlugin> {
    let mut search_paths: Vec<PathBuf> = Vec::new();

    if let Some(p) = base_dir {
        search_paths.push(p.join("plugins"));
    }
    search_paths.push(PathBuf::from("plugins"));
    search_paths.push(PathBuf::from("./campaign/plugins"));

    let mut discovered = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for plugins_folder in search_paths {
        if !plugins_folder.exists() {
            let _ = fs::create_dir_all(&plugins_folder);
            // Scaffold default sample plugin if empty
            let sample_dir = plugins_folder.join("community.sample-logger");
            if !sample_dir.exists() {
                let _ = fs::create_dir_all(&sample_dir);
                let manifest = PluginManifest {
                    id: "community.sample-logger".to_string(),
                    name: "Combat Roll Notifier".to_string(),
                    version: "1.0.0".to_string(),
                    entrypoint: "index.js".to_string(),
                    permissions: vec!["dice:listen".to_string(), "notifications:toast".to_string()],
                    description: Some("Logs live rolls and notifies on natural 20s".to_string()),
                    author: Some("Graywood Community".to_string()),
                };
                let _ = fs::write(
                    sample_dir.join("plugin.json"),
                    serde_json::to_string_pretty(&manifest).unwrap_or_default(),
                );
                let sample_code = r#"// Sample Community Plugin
api.on("dice:roll", (data) => {
  if (data.total === 20 || data.isCritical) {
    api.notifications.toast("🌟 NATURAL 20 rolled by " + (data.roller || "Player") + "!");
  }
});
api.on("token:move", (data) => {
  // Monitored token movements
});
"#;
                let _ = fs::write(sample_dir.join("index.js"), sample_code);
            }
        }

        if let Ok(entries) = fs::read_dir(&plugins_folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let manifest_file = path.join("plugin.json");
                    if manifest_file.exists() {
                        if let Ok(content) = fs::read_to_string(&manifest_file) {
                            if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                                if !seen_ids.contains(&manifest.id) {
                                    let entry_path = path.join(&manifest.entrypoint);
                                    let code = fs::read_to_string(&entry_path).unwrap_or_default();
                                    seen_ids.insert(manifest.id.clone());
                                    discovered.push(DiscoveredPlugin {
                                        dir_name: path
                                            .file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| "plugin".to_string()),
                                        manifest,
                                        code,
                                        folder_path: path.to_string_lossy().to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    discovered
}

/// GET /api/plugins
pub async fn list_plugins_route(
    State(state): State<AppState>,
) -> Result<Json<Vec<DiscoveredPlugin>>, StatusCode> {
    let guard = state.campaign_dir.read().await;
    let base_dir = guard.as_deref();
    let plugins = scan_plugins_dir(base_dir);
    Ok(Json(plugins))
}
