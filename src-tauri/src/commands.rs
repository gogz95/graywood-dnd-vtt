use crate::migrations::export_campaign_archive;
use crate::server::routes::ws::WsEvent;
use crate::systems::encounter::{
    ActiveCombatant, MonsterStatBlock, SpawnCombatantRequest, SpawnCombatantResponse,
};
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, Mutex};

/// IPC command to safely export the local campaign database, assets, and metadata
/// into a compressed `.aleamos` archive file for disaster recovery.
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
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, 1, ?9, ?10, '[]', ?11)",
        params![
            combatant_id,
            payload.encounter_id,
            token_id,
            combatant_name,
            initiative,
            monster.hp_max,
            monster.hp_max,
            monster.ac,
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

/// Recursively scans user-selected campaign directories (e.g. Obsidian vaults)
/// and returns parsed text/data file contents.
pub async fn pick_and_read_campaign_folder() -> Result<Vec<IngestedFileEntry>, String> {
    let folder_handle = rfd::AsyncFileDialog::new()
        .set_title("Select Campaign Vault / Lore Directory")
        .pick_folder()
        .await;

    let folder_path = match folder_handle {
        Some(handle) => handle.path().to_path_buf(),
        None => return Ok(Vec::new()), // User cancelled dialog
    };

    let mut entries = Vec::new();
    let mut dirs_to_visit = vec![folder_path.clone()];

    while let Some(dir) = dirs_to_visit.pop() {
        let read_dir = match std::fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(e) => return Err(format!("Failed to read directory {:?}: {}", dir, e)),
        };

        for entry_res in read_dir {
            let entry = match entry_res {
                Ok(e) => e,
                Err(e) => return Err(format!("Directory entry error: {}", e)),
            };
            let path = entry.path();

            if path.is_dir() {
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    if !dir_name.starts_with('.') {
                        dirs_to_visit.push(path);
                    }
                }
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if matches!(
                        ext_lower.as_str(),
                        "md" | "txt" | "json" | "jsonl" | "csv" | "tsv" | "ds" | "dd2vtt"
                    ) {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let metadata = std::fs::metadata(&path).ok();
                            let size_bytes =
                                metadata.map(|m| m.len()).unwrap_or(content.len() as u64);
                            let rel_path = path
                                .strip_prefix(&folder_path)
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
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IngestScanResult {
    pub root_path: String,
    pub total_files: usize,
    pub total_bytes: u64,
    pub entries: Vec<IngestScanEntry>,
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
pub async fn scan_ingest_directory(
    target_path: Option<String>,
) -> Result<IngestScanResult, String> {
    let folder_path = match target_path {
        Some(ref p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => {
            let handle = rfd::AsyncFileDialog::new()
                .set_title("Select Folder to Ingest (or Ingest/ Root)")
                .pick_folder()
                .await;
            match handle {
                Some(h) => h.path().to_path_buf(),
                None => {
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
        return Err(format!("Directory does not exist: {:?}", folder_path));
    }

    // If folder contains an 'Ingest' or 'ingest' child directory, prioritize that
    let scan_root = if folder_path.join("Ingest").is_dir() {
        folder_path.join("Ingest")
    } else if folder_path.join("ingest").is_dir() {
        folder_path.join("ingest")
    } else {
        folder_path.clone()
    };

    let mut entries = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut dirs_to_visit = vec![scan_root.clone()];

    while let Some(dir) = dirs_to_visit.pop() {
        let read_dir = match tokio::fs::read_dir(&dir).await {
            Ok(rd) => rd,
            Err(e) => return Err(format!("Failed to read directory {:?}: {}", dir, e)),
        };

        let mut stream = read_dir;
        while let Ok(Some(entry)) = stream.next_entry().await {
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

                let metadata = entry.metadata().await.ok();
                let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
                let mime = mime_guess::from_path(&path)
                    .first_or_octet_stream()
                    .to_string();

                let rel_path = path
                    .strip_prefix(&scan_root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");

                let category = classify_ingest_file(Path::new(&rel_path), &ext, &mime);

                total_bytes += size_bytes;
                entries.push(IngestScanEntry {
                    name: file_name,
                    relative_path: rel_path,
                    full_path: path.to_string_lossy().to_string(),
                    category,
                    extension: ext,
                    size_bytes,
                    mime_type: mime,
                });
            }
        }
    }

    Ok(IngestScanResult {
        root_path: scan_root.to_string_lossy().to_string(),
        total_files: entries.len(),
        total_bytes,
        entries,
    })
}
