use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const GRAYWOOD_DIR: &str = ".graywood";
pub const CACHE_TOKENS_DIR: &str = ".graywood/cache/tokens";
pub const CACHE_THUMBNAILS_DIR: &str = ".graywood/cache/thumbnails";
pub const CONFIG_FILE: &str = ".graywood/config.json";
pub const DB_FILE: &str = ".graywood/index.sqlite";
pub const USER_CONFIG_FILENAME: &str = "graywood_workspace_config.json";

pub const IGNORED_CRAWLER_DIRECTORIES: &[&str] = &[
    ".git",
    "node_modules",
    "plugins",
    ".graywood",
    "target",
    "dist",
    ".svelte-kit",
    "build",
    "appdata",
    ".vite",
];

pub fn should_skip_crawler_dir(name: &str) -> bool {
    name.starts_with('.')
        || IGNORED_CRAWLER_DIRECTORIES
            .iter()
            .any(|&d| name.eq_ignore_ascii_case(d))
}

pub fn is_allowed_crawler_file(path: &Path, ext: &str) -> bool {
    match ext {
        "pdf" | "md" | "txt" => true,
        "csv" => true,
        "png" | "jpg" | "jpeg" | "webp" | "uvtt" | "dd2vtt" => true,
        "mp3" | "ogg" | "wav" | "flac" => true,
        "json" => {
            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            let path_str = path.to_string_lossy().to_lowercase();
            filename.contains("manifest")
                || filename.contains("config")
                || filename.contains("table")
                || path_str.contains("tables")
        }
        _ => false,
    }
}

static ACTIVE_WORKSPACE_ROOT: RwLock<Option<PathBuf>> = RwLock::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub version: String,
    pub name: String,
    pub created_at: u64,
    pub active_scene_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    pub root_path: String,
    pub config: WorkspaceConfig,
    pub db_path: String,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedWorkspaceState {
    pub last_workspace_path: Option<String>,
    pub updated_at: u64,
}

pub fn set_active_workspace_path(path: Option<PathBuf>) {
    let mut lock = ACTIVE_WORKSPACE_ROOT.write().unwrap();
    *lock = path;
}

pub fn get_active_workspace_path() -> Option<PathBuf> {
    let lock = ACTIVE_WORKSPACE_ROOT.read().unwrap();
    lock.clone()
}

/// Initializes or updates the internal `.graywood/` directory structure,
/// config file, and baseline SQLite database.
pub fn initialize_workspace(root: &Path) -> Result<WorkspaceConfig, String> {
    if !root.exists() {
        fs::create_dir_all(root)
            .map_err(|e| format!("Failed to create workspace directory {:?}: {}", root, e))?;
    }

    let graywood_dir = root.join(GRAYWOOD_DIR);
    let tokens_dir = root.join(CACHE_TOKENS_DIR);
    let thumbnails_dir = root.join(CACHE_THUMBNAILS_DIR);

    fs::create_dir_all(&graywood_dir)
        .map_err(|e| format!("Failed to create .graywood directory: {}", e))?;
    fs::create_dir_all(&tokens_dir)
        .map_err(|e| format!("Failed to create .graywood/cache/tokens directory: {}", e))?;
    fs::create_dir_all(&thumbnails_dir).map_err(|e| {
        format!(
            "Failed to create .graywood/cache/thumbnails directory: {}",
            e
        )
    })?;

    let config_path = root.join(CONFIG_FILE);
    let config = if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(content) => match serde_json::from_str::<WorkspaceConfig>(&content) {
                Ok(parsed) => parsed,
                Err(_) => create_default_config(root, &config_path)?,
            },
            Err(_) => create_default_config(root, &config_path)?,
        }
    } else {
        create_default_config(root, &config_path)?
    };

    let db_path = root.join(DB_FILE);
    init_workspace_sqlite(&db_path)?;

    set_active_workspace_path(Some(root.to_path_buf()));

    Ok(config)
}

fn create_default_config(root: &Path, config_path: &Path) -> Result<WorkspaceConfig, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(1727870000);

    let folder_name = root
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Campaign Workspace");

    let config = WorkspaceConfig {
        version: "1.0.0".to_string(),
        name: folder_name.to_string(),
        created_at: now,
        active_scene_id: None,
    };

    let json_bytes = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize workspace config: {}", e))?;

    fs::write(config_path, json_bytes)
        .map_err(|e| format!("Failed to write .graywood/config.json: {}", e))?;

    Ok(config)
}

/// Creates or migrates baseline tables in the workspace SQLite database.
pub fn init_workspace_sqlite(db_path: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| {
        format!(
            "Failed to open workspace SQLite database {:?}: {}",
            db_path, e
        )
    })?;

    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let _ = conn.pragma_update(None, "foreign_keys", "ON");

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS metadata (
             key TEXT PRIMARY KEY,
             value TEXT
         );

         CREATE TABLE IF NOT EXISTS entities (
             id TEXT PRIMARY KEY,
             type TEXT,
             name TEXT,
             is_activated INTEGER,
             provenance JSON,
             data JSON
         );

         CREATE TABLE IF NOT EXISTS rollable_tables (
             id TEXT PRIMARY KEY,
             name TEXT,
             formula TEXT,
             provenance JSON,
             entries JSON
         );

         CREATE TABLE IF NOT EXISTS virtual_scenes (
             id TEXT PRIMARY KEY,
             name TEXT,
             asset_rel_path TEXT,
             grid_config JSON
         );

         CREATE TABLE IF NOT EXISTS sourcebooks (
             id TEXT PRIMARY KEY,
             title TEXT NOT NULL,
             author TEXT,
             file_path TEXT NOT NULL,
             total_pages INTEGER NOT NULL,
             cover_url TEXT,
             toc_json TEXT
         );

         CREATE TABLE IF NOT EXISTS sourcebook_pages (
             sourcebook_id TEXT NOT NULL,
             page_number INTEGER NOT NULL,
             raw_text TEXT NOT NULL,
             PRIMARY KEY(sourcebook_id, page_number)
         );",
    )
    .map_err(|e| format!("Failed to initialize workspace SQLite schema: {}", e))?;

    conn.execute(
        "INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1.0.0');",
        [],
    )
    .map_err(|e| format!("Failed to seed workspace SQLite metadata: {}", e))?;

    Ok(())
}

/// Validates whether the target path contains a mounted or valid `.graywood/` workspace.
pub fn validate_workspace(root: &Path) -> Result<bool, String> {
    if !root.exists() || !root.is_dir() {
        return Ok(false);
    }

    let graywood_dir = root.join(GRAYWOOD_DIR);
    let config_path = root.join(CONFIG_FILE);
    let db_path = root.join(DB_FILE);

    if !graywood_dir.exists() || !graywood_dir.is_dir() {
        return Ok(false);
    }

    if !config_path.exists() {
        return Ok(false);
    }

    if let Ok(content) = fs::read_to_string(&config_path) {
        if serde_json::from_str::<WorkspaceConfig>(&content).is_err() {
            return Ok(false);
        }
    } else {
        return Ok(false);
    }

    if db_path.exists() && Connection::open(&db_path).is_err() {
        return Ok(false);
    }

    Ok(true)
}

/// Reads workspace config and metadata for an existing workspace.
pub fn get_workspace_metadata(root: &Path) -> Result<WorkspaceMetadata, String> {
    let is_valid = validate_workspace(root)?;
    let config_path = root.join(CONFIG_FILE);
    let db_path = root.join(DB_FILE);

    let config = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read .graywood/config.json: {}", e))?;
        serde_json::from_str::<WorkspaceConfig>(&content)
            .map_err(|e| format!("Malformed .graywood/config.json: {}", e))?
    } else {
        initialize_workspace(root)?
    };

    Ok(WorkspaceMetadata {
        root_path: root.to_string_lossy().to_string(),
        config,
        db_path: db_path.to_string_lossy().to_string(),
        is_valid,
    })
}

/// Updates `.graywood/config.json` with modified configuration.
pub fn update_workspace_config(root: &Path, config: &WorkspaceConfig) -> Result<(), String> {
    let config_path = root.join(CONFIG_FILE);
    let json_bytes = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize workspace config: {}", e))?;
    fs::write(config_path, json_bytes)
        .map_err(|e| format!("Failed to write .graywood/config.json: {}", e))?;
    Ok(())
}

fn get_user_config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|p| p.join(USER_CONFIG_FILENAME))
        .unwrap_or_else(|_| PathBuf::from(USER_CONFIG_FILENAME))
}

/// Persists the last used workspace directory to application user config.
pub fn persist_last_workspace_path(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let cfg_path = get_user_config_path(app);
    if let Some(parent) = cfg_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let state = PersistedWorkspaceState {
        last_workspace_path: Some(root.to_string_lossy().to_string()),
        updated_at: now,
    };

    let content = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize workspace user config: {}", e))?;

    fs::write(&cfg_path, content)
        .map_err(|e| format!("Failed to persist workspace path to {:?}: {}", cfg_path, e))?;

    Ok(())
}

/// Retrieves the stored last workspace directory from application user config.
pub fn get_persisted_workspace_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let cfg_path = get_user_config_path(app);
    if !cfg_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&cfg_path).ok()?;
    let state = serde_json::from_str::<PersistedWorkspaceState>(&content).ok()?;
    let path_str = state.last_workspace_path?;
    let path = PathBuf::from(path_str);
    if path.exists() && path.is_dir() {
        Some(path)
    } else {
        None
    }
}

fn percent_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

/// Handles `graywood-asset://` requests scoped securely to the active workspace root.
pub fn handle_asset_protocol_request(
    req: tauri::http::Request<Vec<u8>>,
) -> axum::http::Response<Vec<u8>> {
    let raw_path = req.uri().path();
    let decoded_path = percent_decode(raw_path);

    // Reject directory traversal attempts
    let path_obj = Path::new(&decoded_path);
    for component in path_obj.components() {
        if matches!(component, Component::ParentDir) {
            return axum::http::Response::builder()
                .status(403)
                .header("Content-Type", "text/plain")
                .header("Access-Control-Allow-Origin", "*")
                .body(b"Directory traversal forbidden: cannot escape workspace root".to_vec())
                .unwrap();
        }
    }

    let active_root = match get_active_workspace_path() {
        Some(r) => r,
        None => {
            return axum::http::Response::builder()
                .status(503)
                .header("Content-Type", "text/plain")
                .header("Access-Control-Allow-Origin", "*")
                .body(b"No active campaign workspace mounted".to_vec())
                .unwrap();
        }
    };

    // Trim leading slash or backslash
    let trimmed = decoded_path
        .trim_start_matches('/')
        .trim_start_matches('\\');

    let target_file = active_root.join(trimmed);

    // Canonical check to guarantee target file is strictly inside active root
    let canonical_root = match active_root.canonicalize() {
        Ok(c) => c,
        Err(_) => active_root.clone(),
    };

    if !target_file.exists() || !target_file.is_file() {
        return axum::http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .header("Access-Control-Allow-Origin", "*")
            .body(format!("Asset not found: {}", trimmed).into_bytes())
            .unwrap();
    }

    let canonical_target = match target_file.canonicalize() {
        Ok(c) => c,
        Err(_) => target_file.clone(),
    };

    if !canonical_target.starts_with(&canonical_root) {
        return axum::http::Response::builder()
            .status(403)
            .header("Content-Type", "text/plain")
            .header("Access-Control-Allow-Origin", "*")
            .body(b"Access denied: asset path outside workspace boundary".to_vec())
            .unwrap();
    }

    let mime = mime_guess::from_path(&canonical_target)
        .first_or_octet_stream()
        .to_string();

    match fs::read(&canonical_target) {
        Ok(bytes) => axum::http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "public, max-age=3600")
            .body(bytes)
            .unwrap(),
        Err(err) => axum::http::Response::builder()
            .status(500)
            .header("Content-Type", "text/plain")
            .header("Access-Control-Allow-Origin", "*")
            .body(format!("Failed to read asset: {}", err).into_bytes())
            .unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_and_validate_workspace() {
        let temp_dir =
            std::env::temp_dir().join(format!("graywood_ws_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);

        let cfg = initialize_workspace(&temp_dir).expect("workspace init should succeed");
        assert_eq!(cfg.version, "1.0.0");

        assert!(temp_dir.join(".graywood").exists());
        assert!(temp_dir.join(".graywood/cache/tokens").exists());
        assert!(temp_dir.join(".graywood/cache/thumbnails").exists());
        assert!(temp_dir.join(".graywood/config.json").exists());
        assert!(temp_dir.join(".graywood/index.sqlite").exists());

        let conn = Connection::open(temp_dir.join(".graywood/index.sqlite")).unwrap();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"metadata".to_string()));
        assert!(tables.contains(&"entities".to_string()));
        assert!(tables.contains(&"rollable_tables".to_string()));
        assert!(tables.contains(&"virtual_scenes".to_string()));

        let is_valid = validate_workspace(&temp_dir).expect("validation should succeed");
        assert!(is_valid);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
