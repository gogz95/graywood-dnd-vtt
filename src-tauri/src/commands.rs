use crate::migrations::export_campaign_archive;
use crate::server::routes::ws::WsEvent;
use crate::systems::encounter::{
    ActiveCombatant, MonsterStatBlock, SpawnCombatantRequest, SpawnCombatantResponse,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, Mutex};

/// IPC command to launch or focus the borderless secondary projector window.
#[tauri::command]
pub async fn open_projector_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("projector") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        "projector",
        tauri::WebviewUrl::App("projector".into()),
    )
    .title("Graywood VTT - Player Tabletop Projector")
    .inner_size(1920.0, 1080.0)
    .decorations(false)
    .resizable(true);

    builder
        .build()
        .map_err(|e| format!("Failed to create projector window: {}", e))?;

    Ok(())
}

pub async fn export_campaign_archive_cmd(
    db_path: PathBuf,
    assets_dir: PathBuf,
    output_archive_path: String,
) -> Result<String, String> {
    let out_path = Path::new(&output_archive_path);
    export_campaign_archive(&db_path, &assets_dir, out_path)?;
    Ok(format!(
        "Archive successfully exported to: {}",
        output_archive_path
    ))
}

/// IPC command to spawn a compendium monster directly onto the PixiJS canvas coordinates.
/// Instantiates a runtime entity in `active_combatants`, maps parsed AC, multiattack profile,
/// and HP pool directly to a unique runtime `token_id`, and broadcasts `SPAWN_TOKEN`.
#[tauri::command]
pub async fn spawn_combatant_token_cmd(
    db: Arc<Mutex<Connection>>,
    ws_sender: broadcast::Sender<WsEvent>,
    payload: SpawnCombatantRequest,
) -> Result<SpawnCombatantResponse, String> {
    let conn = db.lock().await;

    // 1. Fetch monster definition from compendium
    let monster = MonsterStatBlock::find_by_id(&conn, &payload.monster_compendium_id)
        .map_err(|e| format!("Database error querying monster: {}", e))?
        .ok_or_else(|| {
            format!(
                "Monster '{}' not found in compendium",
                payload.monster_compendium_id
            )
        })?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let combatant_id = format!("combatant-{}", uuid_v4_simple());
    let token_id = format!("token-{}", uuid_v4_simple());
    let combatant_name = payload
        .custom_name
        .clone()
        .unwrap_or_else(|| monster.name.clone());

    let initiative = payload.initiative.unwrap_or(10);

    // 2. Insert into active_combatants
    conn.execute(
        "INSERT INTO active_combatants (
            id, encounter_id, token_id, name, initiative,
            hp_current, hp_max, temp_hp, ac, is_monster,
            monster_compendium_id, multiattack_profile, conditions_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '[]', ?13)",
        params![
            combatant_id,
            payload.encounter_id,
            token_id,
            combatant_name,
            initiative,
            monster.hp_max,
            monster.hp_max,
            0,
            monster.ac,
            1,
            monster.id,
            monster.multiattack_profile,
            now,
        ],
    )
    .map_err(|e| format!("Failed to insert active combatant: {}", e))?;

    let combatant = ActiveCombatant {
        id: combatant_id,
        encounter_id: payload.encounter_id,
        token_id: token_id.clone(),
        name: combatant_name.clone(),
        initiative,
        hp_current: monster.hp_max,
        hp_max: monster.hp_max,
        temp_hp: 0,
        ac: monster.ac,
        is_monster: true,
        monster_compendium_id: Some(monster.id),
        multiattack_profile: Some(monster.multiattack_profile),
        conditions: Vec::new(),
        created_at: now,
    };

    // 3. Broadcast SPAWN_TOKEN over WebSocket hub
    let _ = ws_sender.send(WsEvent::SpawnToken {
        id: token_id.clone(),
        name: combatant_name,
        x: payload.canvas_x,
        y: payload.canvas_y,
        radius: if monster.size == "Large" { 30.0 } else { 22.0 },
        sight_radius: 280.0,
        darkvision_radius: 280.0,
        is_orb_sealed: false,
        tint: 0xef4444,
        ac: monster.ac,
        hp_current: monster.hp_max,
        hp_max: monster.hp_max,
    });

    Ok(SpawnCombatantResponse {
        combatant,
        token_id,
        canvas_x: payload.canvas_x,
        canvas_y: payload.canvas_y,
    })
}

fn uuid_v4_simple() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:016x}", now)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IngestedFileEntry {
    pub name: String,
    pub relative_path: String,
    pub extension: String,
    pub size_bytes: u64,
    pub content: String,
}

/// IPC command to open a native OS file dialog for selecting image/media files.
/// Filters: .png, .jpg, .jpeg, .webp, .webm, .mp4, .dd2vtt, .uvtt, .json
#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_title("Select Image or Media File")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .add_filter("Video", &["mp4", "webm"])
        .add_filter("VTT Map Formats", &["dd2vtt", "uvtt", "json"])
        .blocking_pick_file();

    match file_path {
        Some(path) => Ok(path.to_string()),
        None => Ok(String::new()), // User cancelled
    }
}

fn debug_timestamp() -> String {
    let now = SystemTime::now();
    let duration = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}.{:03}s", duration.as_secs(), duration.subsec_millis())
}

/// IPC command to open a native OS directory dialog for selecting folders.
///
/// Uses async `rfd::AsyncFileDialog` without blocking the Tokio/Tauri event loop.
/// Returns an empty string when the user cancels — never errors on cancellation.
#[tauri::command]
pub async fn open_directory_dialog(_app: tauri::AppHandle) -> Result<String, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Select Campaign Directory")
        .pick_folder()
        .await;

    match handle {
        Some(folder) => Ok(folder.path().to_string_lossy().to_string()),
        None => Ok(String::new()),
    }
}

/// IPC command to read a user-selected campaign vault / lore directory and
/// return parsed text/data file contents.
///
/// Runs on Tokio's blocking thread pool (`spawn_blocking`): the `rfd` folder
/// picker and the synchronous `std::fs` walk execute off the async runtime so
/// the Tauri IPC event loop stays responsive while a vault is scanned.
#[tauri::command]
pub async fn pick_and_read_campaign_folder() -> Result<Vec<IngestedFileEntry>, String> {
    let folder_handle = rfd::AsyncFileDialog::new()
        .set_title("Select Campaign Vault / Lore Directory")
        .pick_folder()
        .await;

    let folder_path = match folder_handle {
        Some(handle) => handle.path().to_path_buf(),
        None => return Ok(Vec::new()), // User cancelled dialog
    };

    // Offload the blocking `std::fs` walk + file reads to Tokio's blocking
    // thread pool so the Tauri async runtime (and the webview IPC loop) is
    // never stalled by vault I/O.
    tokio::task::spawn_blocking(move || {
        read_campaign_folder_entries(&folder_path)
            .map_err(|e| format!("Failed to read campaign folder: {}", e))
    })
    .await
    .map_err(|e| format!("Campaign folder scan task failed: {}", e))?
}

/// Synchronous vault walk backing [`pick_and_read_campaign_folder`].
///
/// Kept as a plain (non-async) helper so it can run inside
/// `tokio::task::spawn_blocking`: every filesystem call here (`read_dir`,
/// `read_to_string`, `metadata`) blocks its thread, which is exactly what the
/// blocking pool is for.
fn read_campaign_folder_entries(folder_path: &Path) -> std::io::Result<Vec<IngestedFileEntry>> {
    let mut entries = Vec::new();
    let walker = walkdir::WalkDir::new(folder_path)
        .follow_links(false)
        .max_depth(15)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !workspace_manager::should_skip_crawler_dir(&name)
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if workspace_manager::is_allowed_crawler_file(path, &ext_lower) {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let metadata = entry.metadata().ok();
                        let size_bytes = metadata.map(|m| m.len()).unwrap_or(content.len() as u64);
                        let rel_path = path
                            .strip_prefix(folder_path)
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|_| path.to_string_lossy().to_string());
                        let name = path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| "unnamed".to_string());

                        entries.push(IngestedFileEntry {
                            name,
                            relative_path: rel_path,
                            extension: ext_lower,
                            size_bytes,
                            content,
                        });
                    }
                }
            }
        }
    }

    Ok(entries)
}

/// IPC command to detect the local network IP address for table players.
pub fn get_lan_ip_cmd() -> String {
    match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => match socket.connect("8.8.8.8:80") {
            Ok(()) => socket
                .local_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or_else(|_| "127.0.0.1".to_string()),
            Err(_) => "127.0.0.1".to_string(),
        },
        Err(_) => "127.0.0.1".to_string(),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IngestScanEntry {
    pub name: String,
    pub relative_path: String,
    pub full_path: String,
    pub category: String, // "source" | "image" | "audio" | "video"
    pub extension: String,
    pub size_bytes: u64,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IngestScanResult {
    pub root_path: String,
    pub total_files: usize,
    pub total_bytes: u64,
    pub entries: Vec<IngestScanEntry>,
}

fn extract_dimensions_and_content(
    path: &Path,
    ext: &str,
) -> (Option<u32>, Option<u32>, Option<u32>, Option<String>) {
    use std::io::Read;

    match ext {
        "png" => {
            if let Ok(mut f) = std::fs::File::open(path) {
                let mut buf = [0u8; 32];
                if let Ok(n) = f.read(&mut buf) {
                    if n >= 24 && &buf[0..8] == b"\x89PNG\r\n\x1a\n" {
                        let w = u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]);
                        let h = u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]);
                        return (Some(w), Some(h), None, None);
                    }
                }
            }
            (None, None, None, None)
        }
        "jpg" | "jpeg" => {
            if let Ok(mut f) = std::fs::File::open(path) {
                let mut buf = vec![0u8; 65536];
                if let Ok(n) = f.read(&mut buf) {
                    let buf = &buf[..n];
                    if buf.len() > 4 && buf[0] == 0xFF && buf[1] == 0xD8 {
                        let mut i = 2;
                        while i + 9 < buf.len() {
                            if buf[i] != 0xFF {
                                i += 1;
                                continue;
                            }
                            let marker = buf[i + 1];
                            if marker == 0xC0 || marker == 0xC1 || marker == 0xC2 {
                                let h = u16::from_be_bytes([buf[i + 5], buf[i + 6]]) as u32;
                                let w = u16::from_be_bytes([buf[i + 7], buf[i + 8]]) as u32;
                                return (Some(w), Some(h), None, None);
                            }
                            if marker == 0xD9 || marker == 0xDA {
                                break;
                            }
                            if i + 4 > buf.len() {
                                break;
                            }
                            let len = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
                            i += 2 + len;
                        }
                    }
                }
            }
            (None, None, None, None)
        }
        "webp" => {
            if let Ok(mut f) = std::fs::File::open(path) {
                let mut buf = [0u8; 64];
                if let Ok(n) = f.read(&mut buf) {
                    let buf = &buf[..n];
                    if buf.len() >= 30 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
                        if &buf[12..16] == b"VP8X" && buf.len() >= 30 {
                            let w = 1
                                + (buf[24] as u32
                                    | ((buf[25] as u32) << 8)
                                    | ((buf[26] as u32) << 16));
                            let h = 1
                                + (buf[27] as u32
                                    | ((buf[28] as u32) << 8)
                                    | ((buf[29] as u32) << 16));
                            return (Some(w), Some(h), None, None);
                        } else if &buf[12..16] == b"VP8 " && buf.len() >= 30 {
                            let w = (u16::from_le_bytes([buf[26], buf[27]]) & 0x3FFF) as u32;
                            let h = (u16::from_le_bytes([buf[28], buf[29]]) & 0x3FFF) as u32;
                            return (Some(w), Some(h), None, None);
                        } else if &buf[12..16] == b"VP8L" && buf.len() >= 25 {
                            let b0 = buf[21] as u32;
                            let b1 = buf[22] as u32;
                            let b2 = buf[23] as u32;
                            let b3 = buf[24] as u32;
                            let w = 1 + (((b1 & 0x3F) << 8) | b0);
                            let h = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
                            return (Some(w), Some(h), None, None);
                        }
                    }
                }
            }
            (None, None, None, None)
        }
        "dd2vtt" | "uvtt" => {
            if let Ok(meta) = std::fs::metadata(path) {
                if meta.len() <= 10 * 1024 * 1024 {
                    if let Ok(text) = std::fs::read_to_string(path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                            let ppg = val
                                .pointer("/resolution/pixels_per_grid")
                                .and_then(|v| v.as_u64())
                                .map(|p| p as u32);
                            let gx = val
                                .pointer("/resolution/map_size/x")
                                .and_then(|v| v.as_f64());
                            let gy = val
                                .pointer("/resolution/map_size/y")
                                .and_then(|v| v.as_f64());
                            let (w, h) = match (gx, gy, ppg) {
                                (Some(x), Some(y), Some(p)) => (
                                    Some((x * p as f64).round() as u32),
                                    Some((y * p as f64).round() as u32),
                                ),
                                (Some(x), Some(y), None) => {
                                    (Some(x.round() as u32), Some(y.round() as u32))
                                }
                                _ => (None, None),
                            };
                            return (w, h, ppg, Some(text));
                        }
                        return (None, None, None, Some(text));
                    }
                }
            }
            (None, None, None, None)
        }
        "md" | "txt" | "json" | "ds" => {
            if let Ok(meta) = std::fs::metadata(path) {
                if meta.len() <= 5 * 1024 * 1024 {
                    if let Ok(text) = std::fs::read_to_string(path) {
                        return (None, None, None, Some(text));
                    }
                }
            }
            (None, None, None, None)
        }
        _ => (None, None, None, None),
    }
}

/// Categorizes a file path using folder topology or extension/MIME inspection.
pub fn classify_ingest_file(rel_path: &Path, ext: &str, mime: &str) -> String {
    let rel_str = rel_path.to_string_lossy().to_lowercase();

    // Check directory topology first
    if rel_str.contains("source material")
        || rel_str.contains("sources")
        || rel_str.contains("source")
    {
        return "source".to_string();
    }
    if rel_str.contains("image") || rel_str.contains("maps") || rel_str.contains("tokens") {
        return "image".to_string();
    }
    if rel_str.contains("audio") || rel_str.contains("sounds") || rel_str.contains("music") {
        return "audio".to_string();
    }
    if rel_str.contains("video") || rel_str.contains("videos") {
        return "video".to_string();
    }

    // Fall back to extension inspection
    match ext {
        "md" | "txt" | "json" | "jsonl" | "csv" | "tsv" | "zip" | "ds" | "pdf" => {
            "source".to_string()
        }
        "png" | "jpg" | "jpeg" | "webp" | "dd2vtt" | "uvtt" | "geojson" => "image".to_string(),
        "ogg" | "mp3" | "wav" | "flac" | "m4a" => "audio".to_string(),
        "mp4" | "webm" => "video".to_string(),
        _ => {
            if mime.starts_with("video/") {
                "video".to_string()
            } else if mime.starts_with("audio/") {
                "audio".to_string()
            } else if mime.starts_with("image/") {
                "image".to_string()
            } else {
                "source".to_string()
            }
        }
    }
}

/// Recursively scans an Ingest directory or selected folder without blocking the UI thread.
///
/// Runs on Tokio's blocking thread pool (`spawn_blocking`) with bounded WalkDir
/// traversal (`follow_links(false)`, `max_depth(15)`), eliminating synchronous
/// event loop stalls and symlink recursion loops.
#[tauri::command]
pub async fn scan_ingest_directory(
    target_path: Option<String>,
) -> Result<IngestScanResult, String> {
    let now_ts = debug_timestamp();
    eprintln!(
        "[INGEST-DEBUG] [{}] Phase 1: Ingestion scan command started with target: {:?}",
        now_ts, target_path
    );

    let folder_path = match target_path {
        Some(ref p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => {
            eprintln!(
                "[INGEST-DEBUG] [{}] Phase 1: No target path provided, launching native folder picker...",
                debug_timestamp()
            );
            let handle = rfd::AsyncFileDialog::new()
                .set_title("Select Folder to Ingest (or Ingest/ Root)")
                .pick_folder()
                .await;
            match handle {
                Some(h) => h.path().to_path_buf(),
                None => {
                    eprintln!(
                        "[INGEST-DEBUG] [{}] Phase 1: User cancelled folder picker",
                        debug_timestamp()
                    );
                    return Ok(IngestScanResult {
                        root_path: String::new(),
                        total_files: 0,
                        total_bytes: 0,
                        entries: Vec::new(),
                    });
                }
            }
        }
    };

    if !folder_path.exists() {
        let err_msg = format!("Directory does not exist: {:?}", folder_path);
        eprintln!(
            "[INGEST-DEBUG] [{}] Phase 1 Error: {}",
            debug_timestamp(),
            err_msg
        );
        return Err(err_msg);
    }

    let scan_root = folder_path.clone();
    eprintln!(
        "[INGEST-DEBUG] [{}] Phase 2: Scan root resolved and verified: {:?}. Offloading to spawn_blocking...",
        debug_timestamp(),
        scan_root
    );

    let result = tokio::task::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        eprintln!(
            "[INGEST-DEBUG] [{}] Phase 3: Directory crawl started on blocking thread pool for {:?}",
            debug_timestamp(),
            scan_root
        );

        let mut entries = Vec::new();
        let mut total_bytes: u64 = 0;
        let mut crawled_count: usize = 0;

        let walker = walkdir::WalkDir::new(&scan_root)
            .follow_links(false)
            .max_depth(15)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !workspace_manager::should_skip_crawler_dir(&name)
            });

        for entry in walker.filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                if !workspace_manager::is_allowed_crawler_file(path, &ext) {
                    continue;
                }

                crawled_count += 1;
                let file_name = entry.file_name().to_string_lossy().to_string();

                let metadata = entry.metadata().ok();
                let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
                let mime = mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .to_string();

                let rel_path = path
                    .strip_prefix(&scan_root)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .replace('\\', "/");

                let category = classify_ingest_file(Path::new(&rel_path), &ext, &mime);
                let (width, height, grid_size, content) =
                    extract_dimensions_and_content(path, &ext);

                total_bytes += size_bytes;
                entries.push(IngestScanEntry {
                    name: file_name,
                    relative_path: rel_path.clone(),
                    full_path: path.to_string_lossy().to_string(),
                    category,
                    extension: ext,
                    size_bytes,
                    mime_type: mime,
                    width,
                    height,
                    grid_size,
                    content,
                });

                if crawled_count.is_multiple_of(100) {
                    eprintln!(
                        "[INGEST-DEBUG] [{}] Phase 3: Crawled {} files so far (latest: {})",
                        debug_timestamp(),
                        crawled_count,
                        rel_path
                    );
                }
            }
        }

        eprintln!(
            "[INGEST-DEBUG] [{}] Phase 4: Crawl finished in {:?}. Total files: {}, Total size: {} bytes",
            debug_timestamp(),
            start_time.elapsed(),
            entries.len(),
            total_bytes
        );

        IngestScanResult {
            root_path: scan_root.to_string_lossy().to_string(),
            total_files: entries.len(),
            total_bytes,
            entries,
        }
    })
    .await
    .map_err(|e| format!("Ingestion task panicked or failed: {}", e))?;

    eprintln!(
        "[INGEST-DEBUG] [{}] Phase 4: Returning {} scan entries to caller",
        debug_timestamp(),
        result.total_files
    );
    Ok(result)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct WallColliderPayload {
    pub id: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub blocks_light: Option<bool>,
    pub blocks_movement: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SaveMapVectorRequest {
    pub map_id: String,
    pub name: String,
    pub grid_size: u32,
    pub walls: Vec<WallColliderPayload>,
}

#[tauri::command]
pub async fn save_map_vector_geometry(
    state: tauri::State<'_, crate::server::state::AppState>,
    request: SaveMapVectorRequest,
) -> Result<usize, String> {
    let conn = state.db.lock().await;
    conn.execute(
        "INSERT INTO maps (id, name, grid_size, data_json)
         VALUES (?1, ?2, ?3, '{}')
         ON CONFLICT(id) DO UPDATE SET name = ?2, grid_size = ?3",
        params![request.map_id, request.name, request.grid_size],
    )
    .map_err(|e| format!("Failed to upsert map: {}", e))?;

    conn.execute(
        "DELETE FROM wall_colliders WHERE map_id = ?1",
        params![request.map_id],
    )
    .map_err(|e| format!("Failed to clear existing wall colliders: {}", e))?;

    let mut count = 0;
    for w in &request.walls {
        conn.execute(
            "INSERT INTO wall_colliders (id, map_id, x1, y1, x2, y2, blocks_light, blocks_movement)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                w.id,
                request.map_id,
                w.x1,
                w.y1,
                w.x2,
                w.y2,
                if w.blocks_light.unwrap_or(true) { 1 } else { 0 },
                if w.blocks_movement.unwrap_or(true) {
                    1
                } else {
                    0
                },
            ],
        )
        .map_err(|e| format!("Failed to insert wall collider {}: {}", w.id, e))?;
        count += 1;
    }

    Ok(count)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FtsSearchResult {
    pub entity_id: String,
    pub title: String,
    pub snippet: String,
    pub category: String,
    pub rank: f64,
}

/// Executes an FTS5 MATCH query with snippet/highlight extraction and ranked results
/// across campaign journal entries, notes, compendium monsters, and spells.
#[tauri::command]
pub async fn search_campaign_fts(
    state: tauri::State<'_, crate::server::state::AppState>,
    query: String,
) -> Result<Vec<FtsSearchResult>, String> {
    let raw_q = query.trim();
    if raw_q.is_empty() {
        return Ok(Vec::new());
    }

    let conn = state.db.lock().await;

    // Ensure virtual table exists if database was already initialized
    let _ = conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS campaign_fts USING fts5(
            title,
            content,
            category,
            entity_id UNINDEXED
        );",
    );

    // Build FTS5 token prefix query
    let words: Vec<String> = raw_q
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"*", w.replace('"', "\"\"")))
        .collect();

    let fts_query = if words.is_empty() {
        format!("\"{}\"*", raw_q.replace('"', "\"\""))
    } else {
        words.join(" ")
    };

    let mut stmt = match conn.prepare(
        "SELECT entity_id, title, snippet(campaign_fts, 1, '<mark>', '</mark>', '...', 20), category, rank
         FROM campaign_fts
         WHERE campaign_fts MATCH ?1
         ORDER BY rank
         LIMIT 50;",
    ) {
        Ok(s) => s,
        Err(e) => return Err(format!("Failed to prepare FTS5 query: {}", e)),
    };

    let rows = match stmt.query_map(params![fts_query], |row| {
        Ok(FtsSearchResult {
            entity_id: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
            category: row.get(3)?,
            rank: row.get(4)?,
        })
    }) {
        Ok(r) => r,
        Err(e) => return Err(format!("Failed to execute FTS5 query: {}", e)),
    };

    let mut results: Vec<FtsSearchResult> = rows.filter_map(|r| r.ok()).collect();

    // Fallback search across lore_documents, monsters, and spells if FTS5 returned 0 matches
    if results.is_empty() {
        let pattern = format!("%{}%", raw_q);
        if let Ok(mut lore_stmt) = conn.prepare(
            "SELECT id, title, substr(content_markdown, 1, 120), category FROM lore_documents
             WHERE title LIKE ?1 OR content_markdown LIKE ?1 LIMIT 20;",
        ) {
            if let Ok(lore_rows) = lore_stmt.query_map(params![pattern], |row| {
                Ok(FtsSearchResult {
                    entity_id: row.get(0)?,
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                    category: row.get(3)?,
                    rank: 0.0,
                })
            }) {
                results.extend(lore_rows.filter_map(|r| r.ok()));
            }
        }
    }

    Ok(results)
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE E5: VTTBUNDLE PACKAGING & FOREIGN SCENE TRANSPILERS
// ═════════════════════════════════════════════════════════════════════════════

use crate::services::campaign_packager::{
    export_vttbundle, import_vttbundle, ImportVttBundleResult, VttBundleManifest,
};
use crate::services::scene_importers::foundry::{transpile_foundry_scene, TranspiledFoundryScene};
use crate::services::scene_importers::roll20::{transpile_roll20_page, TranspiledRoll20Page};

#[tauri::command]
pub async fn export_vttbundle_cmd(
    db_path: String,
    assets_dir: String,
    dexie_json: Option<String>,
    output_bundle_path: String,
    campaign_name: Option<String>,
) -> Result<VttBundleManifest, String> {
    let db = Path::new(&db_path);
    let assets = Path::new(&assets_dir);
    let out = Path::new(&output_bundle_path);
    let name = campaign_name.as_deref().unwrap_or("Graywood Campaign");

    export_vttbundle(db, assets, dexie_json.as_deref(), out, name)
}

#[tauri::command]
pub async fn import_vttbundle_cmd(
    bundle_path: String,
    target_campaign_dir: String,
) -> Result<ImportVttBundleResult, String> {
    let bundle = Path::new(&bundle_path);
    let target = Path::new(&target_campaign_dir);

    import_vttbundle(bundle, target)
}

#[tauri::command]
pub fn transpile_foundry_scene_cmd(json_content: String) -> Result<TranspiledFoundryScene, String> {
    transpile_foundry_scene(&json_content)
}

#[tauri::command]
pub fn transpile_roll20_page_cmd(json_content: String) -> Result<TranspiledRoll20Page, String> {
    transpile_roll20_page(&json_content)
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGN WORKSPACE HUB ARCHITECTURE
// ═════════════════════════════════════════════════════════════════════════════

use crate::server::AppState;
use crate::services::workspace_manager::{
    self, get_persisted_workspace_path, get_workspace_metadata, initialize_workspace as init_ws,
    persist_last_workspace_path, set_active_workspace_path, validate_workspace as val_ws,
};
pub use crate::services::workspace_manager::{WorkspaceConfig, WorkspaceMetadata};

#[tauri::command]
pub async fn set_active_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<WorkspaceConfig, String> {
    let root = PathBuf::from(&path);
    let config = init_ws(&root)?;
    set_active_workspace_path(Some(root.clone()));
    *state.campaign_dir.write().await = Some(root.clone());
    persist_last_workspace_path(&app, &root)?;
    Ok(config)
}

#[tauri::command]
pub fn validate_workspace(path: String) -> Result<bool, String> {
    let root = PathBuf::from(&path);
    val_ws(&root)
}

#[tauri::command]
pub async fn get_active_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<WorkspaceMetadata>, String> {
    if let Some(active_root) = workspace_manager::get_active_workspace_path() {
        if let Ok(meta) = get_workspace_metadata(&active_root) {
            return Ok(Some(meta));
        }
    }

    if let Some(persisted_root) = get_persisted_workspace_path(&app) {
        if val_ws(&persisted_root).unwrap_or(false) {
            set_active_workspace_path(Some(persisted_root.clone()));
            *state.campaign_dir.write().await = Some(persisted_root.clone());
            if let Ok(meta) = get_workspace_metadata(&persisted_root) {
                return Ok(Some(meta));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn initialize_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<WorkspaceConfig, String> {
    set_active_workspace(app, state, path).await
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAMING PDF COMPILER & BLUEPRINT ACTIVATION
// ═════════════════════════════════════════════════════════════════════════════

pub use crate::services::pdf_compiler::{
    compile_sourcebook_streaming, ActivatedEntityRecord, CompilePdfResult, CompilerProgressEvent,
};

#[tauri::command]
pub async fn compile_sourcebook_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    file_rel_path: String,
) -> Result<CompilePdfResult, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    compile_sourcebook_streaming(app, &workspace_root, &file_rel_path).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestPdfResult {
    pub monsters_count: usize,
    pub spells_count: usize,
    pub items_count: usize,
    pub tables_count: usize,
}

#[tauri::command]
pub async fn ingest_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    file_path: String,
) -> Result<IngestPdfResult, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    let file_rel_path = {
        let p = Path::new(&file_path);
        if p.is_absolute() {
            p.strip_prefix(&workspace_root)
                .map(|stripped| stripped.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| file_path.clone())
        } else {
            file_path.clone()
        }
    };

    let compile_result = compile_sourcebook_streaming(app, &workspace_root, &file_rel_path).await?;
    let tables = crate::services::table_extractor::extract_tables_from_pdf(&workspace_root, &file_rel_path)?;

    let mut monsters_count = 0;
    let mut spells_count = 0;
    let mut items_count = 0;

    for entity in &compile_result.entities {
        match entity.entity_type.to_lowercase().as_str() {
            "monster" => monsters_count += 1,
            "spell" => spells_count += 1,
            "item" | "equipment" | "magic_item" => items_count += 1,
            _ => monsters_count += 1,
        }
    }

    Ok(IngestPdfResult {
        monsters_count,
        spells_count,
        items_count,
        tables_count: tables.len(),
    })
}

#[tauri::command]
pub async fn import_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    file_path: String,
) -> Result<IngestPdfResult, String> {
    ingest_pdf(app, state, file_path).await
}

// ═════════════════════════════════════════════════════════════════════════════
// ROLLABLE TABLE EXTRACTION & WORKSPACE SYNC
// ═════════════════════════════════════════════════════════════════════════════

pub use crate::services::table_extractor::{
    extract_tables_from_pdf, extract_tables_from_text, parse_csv_table, parse_markdown_table,
    read_all_tables_from_db, scan_and_sync_workspace_tables, RollableTableRecord, TableEntry,
    TableProvenance,
};

#[tauri::command]
pub async fn sync_workspace_tables_cmd(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RollableTableRecord>, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    scan_and_sync_workspace_tables(&workspace_root)
}

#[tauri::command]
pub async fn get_rollable_tables_cmd(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RollableTableRecord>, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    // First ensure workspace Tables/ folder is scanned
    let _ = scan_and_sync_workspace_tables(&workspace_root);
    read_all_tables_from_db(&workspace_root)
}

#[tauri::command]
pub async fn extract_tables_from_sourcebook_cmd(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    file_rel_path: String,
    page_number: usize,
    text_content: String,
) -> Result<Vec<RollableTableRecord>, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    let tables = extract_tables_from_text(&text_content, &file_rel_path, page_number);

    // Save to SQLite
    let db_path = workspace_root.join(".graywood/index.sqlite");
    if db_path.exists() {
        if let Ok(conn) = Connection::open(&db_path) {
            for t in &tables {
                let prov_json = serde_json::to_string(&t.provenance).unwrap_or_default();
                let entries_json = serde_json::to_string(&t.entries).unwrap_or_default();

                let _ = conn.execute(
                    "INSERT OR REPLACE INTO rollable_tables (id, name, formula, provenance, entries)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![t.id, t.name, t.formula, prov_json, entries_json],
                );
            }
        }
    }

    Ok(tables)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HydratedEntityRecord {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub is_activated: i32,
    pub provenance: serde_json::Value,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HydratedWorkspaceData {
    pub entities: Vec<HydratedEntityRecord>,
    pub tables: Vec<RollableTableRecord>,
}

#[tauri::command]
pub async fn get_hydrated_entities(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<HydratedWorkspaceData, String> {
    let workspace_root = match workspace_manager::get_active_workspace_path() {
        Some(p) => p,
        None => {
            let guard = state.campaign_dir.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => return Err("No active campaign workspace mounted".to_string()),
            }
        }
    };

    let db_path = workspace_root.join(".graywood/index.sqlite");
    if !db_path.exists() {
        return Ok(HydratedWorkspaceData {
            entities: Vec::new(),
            tables: Vec::new(),
        });
    }

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open index.sqlite: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, type, name, is_activated, provenance, data FROM entities")
        .map_err(|e| format!("Failed to prepare query on entities: {}", e))?;

    let entity_rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let entity_type: String = row.get(1)?;
            let name: String = row.get(2)?;
            let is_activated: i32 = row.get(3)?;
            let prov_str: String = row.get(4)?;
            let data_str: String = row.get(5)?;

            let provenance: serde_json::Value =
                serde_json::from_str(&prov_str).unwrap_or(serde_json::Value::Null);
            let data: serde_json::Value =
                serde_json::from_str(&data_str).unwrap_or(serde_json::Value::Null);

            Ok(HydratedEntityRecord {
                id,
                entity_type,
                name,
                is_activated,
                provenance,
                data,
            })
        })
        .map_err(|e| format!("Query map failed: {}", e))?;

    let mut entities = Vec::new();
    for e in entity_rows.flatten() {
        entities.push(e);
    }

    let tables = crate::services::table_extractor::read_all_tables_from_db(&workspace_root)
        .unwrap_or_default();

    Ok(HydratedWorkspaceData { entities, tables })
}
