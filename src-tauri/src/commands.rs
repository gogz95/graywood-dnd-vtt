use crate::migrations::export_campaign_archive;
use crate::models::compendium::CompendiumMonster;
use crate::server::routes::ws::WsEvent;
use crate::systems::encounter::{ActiveCombatant, SpawnCombatantRequest, SpawnCombatantResponse};
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
    Ok(format!("Archive successfully exported to: {}", output_archive_path))
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
    let monster = CompendiumMonster::find_by_id(&conn, &payload.monster_compendium_id)
        .map_err(|e| format!("Database error querying monster: {}", e))?
        .ok_or_else(|| format!("Monster '{}' not found in compendium", payload.monster_compendium_id))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let combatant_id = format!("combatant-{}", &uuid_v4_simple());
    let token_id = format!("token-{}", &uuid_v4_simple());
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
        token_id: token_id.clone(),
        name: combatant_name,
        x: payload.canvas_x,
        y: payload.canvas_y,
        hp_current: monster.hp_max,
        hp_max: monster.hp_max,
        ac: monster.ac,
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
