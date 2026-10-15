// src-tauri/src/server/routes/plugins.rs
// Filesystem discovery, manifest validation, zip sideloading and runtime ESM static delivery for plugins

use axum::{
    body::Body,
    extract::{Multipart, Path as AxumPath, State},
    http::{header, HeaderValue, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

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
#[serde(rename_all = "camelCase")]
pub struct ExternalPluginItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub entrypoint: String,
    pub script_url: String,
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
    search_paths.push(PathBuf::from("./app_data/plugins"));

    let mut discovered = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for plugins_folder in search_paths {
        if !plugins_folder.exists() {
            let _ = fs::create_dir_all(&plugins_folder);
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

/// GET /api/plugins/external
/// Scans ./app_data/plugins/*/plugin.json and returns external manifests with scriptUrl.
pub async fn list_external_plugins_route() -> Json<Vec<ExternalPluginItem>> {
    let mut plugins = Vec::new();
    let plugins_dir = PathBuf::from("./app_data/plugins");

    if !plugins_dir.exists() {
        let _ = fs::create_dir_all(&plugins_dir);
    }

    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let manifest_file = path.join("plugin.json");
                if manifest_file.exists() {
                    if let Ok(content) = fs::read_to_string(&manifest_file) {
                        if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                            let script_url =
                                format!("/plugins/{}/{}", manifest.id, manifest.entrypoint);
                            plugins.push(ExternalPluginItem {
                                id: manifest.id,
                                name: manifest.name,
                                version: manifest.version,
                                description: manifest.description,
                                entrypoint: manifest.entrypoint,
                                script_url,
                            });
                        }
                    }
                }
            }
        }
    }

    Json(plugins)
}

/// POST /api/plugins/sideload
/// Unpacks a .zip archive containing plugin.json and index.js into ./app_data/plugins/{id}/
pub async fn sideload_plugin_route(
    mut multipart: Multipart,
) -> Result<Json<ExternalPluginItem>, (StatusCode, String)> {
    let mut zip_data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" || name == "plugin" || name == "zip" || field.file_name().is_some() {
            let data = field
                .bytes()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, format!("Upload read error: {}", e)))?;
            zip_data = Some(data.to_vec());
            break;
        }
    }

    let bytes = zip_data
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "No .zip file provided".to_string()))?;

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid zip archive: {}", e)))?;

    let mut has_plugin_json = false;
    let mut has_index_js = false;
    let mut manifest_content = String::new();

    // 1. Validation pass: verify required files and reject traversal attacks
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Corrupt zip entry: {}", e)))?;

        let raw_name = file.name().to_string();
        if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.starts_with('\\') {
            return Err((
                StatusCode::BAD_REQUEST,
                "Illegal path traversal detected in archive".to_string(),
            ));
        }

        if file.enclosed_name().is_none() {
            return Err((
                StatusCode::BAD_REQUEST,
                "Unsafe file path detected in archive".to_string(),
            ));
        }

        let normalized = raw_name.trim_start_matches("./");
        if normalized == "plugin.json" {
            has_plugin_json = true;
            file.read_to_string(&mut manifest_content)
                .map_err(|e| (StatusCode::BAD_REQUEST, format!("Failed reading plugin.json: {}", e)))?;
        } else if normalized == "index.js" || normalized.ends_with("/index.js") {
            has_index_js = true;
        }
    }

    if !has_plugin_json {
        return Err((
            StatusCode::BAD_REQUEST,
            "Archive missing root plugin.json manifest".to_string(),
        ));
    }
    if !has_index_js {
        return Err((
            StatusCode::BAD_REQUEST,
            "Archive missing root index.js entrypoint".to_string(),
        ));
    }

    let manifest: PluginManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid plugin.json schema: {}", e)))?;

    if manifest.id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Plugin ID cannot be empty".to_string(),
        ));
    }

    // 2. Extract into ./app_data/plugins/{manifest.id}/
    let target_dir = PathBuf::from("./app_data/plugins").join(&manifest.id);
    fs::create_dir_all(&target_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed creating destination directory: {}", e),
        )
    })?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Error reading zip entry: {}", e)))?;

        if let Some(enclosed) = file.enclosed_name() {
            let outpath = target_dir.join(enclosed);
            if file.is_dir() {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(parent) = outpath.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed creating extracted file {:?}: {}", outpath, e),
                    )
                })?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed writing extracted file {:?}: {}", outpath, e),
                    )
                })?;
            }
        }
    }

    let script_url = format!("/plugins/{}/{}", manifest.id, manifest.entrypoint);
    Ok(Json(ExternalPluginItem {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        entrypoint: manifest.entrypoint,
        script_url,
    }))
}

/// GET /plugins/*path
/// Serves external plugin ESM modules and assets from ./app_data/plugins
pub async fn serve_plugin_static(AxumPath(path): AxumPath<String>) -> impl IntoResponse {
    let safe_path = path.trim_start_matches('/').replace("..", "");
    let file_path = PathBuf::from("./app_data/plugins").join(&safe_path);

    if file_path.exists() && file_path.is_file() {
        if let Ok(bytes) = tokio::fs::read(&file_path).await {
            let mime = mime_guess::from_path(&file_path).first_or_octet_stream();
            let res = Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or_else(|_| HeaderValue::from_static("application/javascript")),
                )
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::CACHE_CONTROL, "no-cache");
            return res.body(Body::from(bytes)).unwrap_or_else(|_| {
                Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Body::empty())
                    .unwrap()
            });
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("Plugin file not found"))
        .unwrap()
}
