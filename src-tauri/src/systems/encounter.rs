use crate::server::routes::ws::WsEvent;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Encounter {
    pub id: String,
    pub name: String,
    pub round: i32,
    pub current_turn_index: i32,
    pub is_active: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActiveCombatant {
    pub id: String,
    pub encounter_id: String,
    pub token_id: String,
    pub name: String,
    pub initiative: i32,
    pub hp_current: i32,
    pub hp_max: i32,
    pub temp_hp: i32,
    pub ac: i32,
    pub is_monster: bool,
    pub monster_compendium_id: Option<String>,
    pub multiattack_profile: Option<String>,
    pub conditions: Vec<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MonsterStatBlock {
    pub id: String,
    pub name: String,
    pub size: String,
    pub creature_type: String,
    pub alignment: String,
    pub ac: i32,
    pub hp_max: i32,
    pub hit_dice: String,
    pub speed: i32,
    pub challenge_rating: f64,
    pub multiattack_profile: String,
    pub actions_json: String,
    pub traits_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnCombatantRequest {
    pub encounter_id: String,
    pub monster_compendium_id: String,
    pub custom_name: Option<String>,
    pub initiative: Option<i32>,
    pub canvas_x: f64,
    pub canvas_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnCombatantResponse {
    pub combatant: ActiveCombatant,
    pub token_id: String,
    pub canvas_x: f64,
    pub canvas_y: f64,
}

impl Encounter {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let is_active_int: i32 = row.get("is_active")?;
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            round: row.get("round")?,
            current_turn_index: row.get("current_turn_index")?,
            is_active: is_active_int != 0,
            created_at: row.get("created_at")?,
        })
    }
}

impl ActiveCombatant {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let is_monster_int: i32 = row.get("is_monster")?;
        let conditions_json: String = row.get("conditions_json")?;
        let conditions: Vec<String> = serde_json::from_str(&conditions_json).unwrap_or_default();

        Ok(Self {
            id: row.get("id")?,
            encounter_id: row.get("encounter_id")?,
            token_id: row.get("token_id")?,
            name: row.get("name")?,
            initiative: row.get("initiative")?,
            hp_current: row.get("hp_current")?,
            hp_max: row.get("hp_max")?,
            temp_hp: row.get("temp_hp")?,
            ac: row.get("ac")?,
            is_monster: is_monster_int != 0,
            monster_compendium_id: row.get("monster_compendium_id")?,
            multiattack_profile: row.get("multiattack_profile")?,
            conditions,
            created_at: row.get("created_at")?,
        })
    }
}

impl MonsterStatBlock {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            size: row.get("size")?,
            creature_type: row.get("creature_type")?,
            alignment: row.get("alignment")?,
            ac: row.get("ac")?,
            hp_max: row.get("hp_max")?,
            hit_dice: row.get("hit_dice")?,
            speed: row.get("speed")?,
            challenge_rating: row.get("challenge_rating")?,
            multiattack_profile: row.get("multiattack_profile")?,
            actions_json: row.get("actions_json")?,
            traits_json: row.get("traits_json")?,
        })
    }

    pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, size, creature_type, alignment, ac, hp_max, hit_dice,
                    speed, challenge_rating, multiattack_profile, actions_json, traits_json
             FROM compendium_monsters ORDER BY challenge_rating ASC, name ASC",
        )?;
        let rows = stmt.query_map([], Self::from_row)?;
        let mut monsters = Vec::new();
        for m in rows {
            monsters.push(m?);
        }
        Ok(monsters)
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        conn.query_row(
            "SELECT id, name, size, creature_type, alignment, ac, hp_max, hit_dice,
                    speed, challenge_rating, multiattack_profile, actions_json, traits_json
             FROM compendium_monsters WHERE id = ?1",
            params![id],
            Self::from_row,
        )
        .optional()
    }
}

/// Retrieves the current active encounter and sorted initiative list of combatants.
pub fn get_active_encounter(
    conn: &Connection,
) -> rusqlite::Result<Option<(Encounter, Vec<ActiveCombatant>)>> {
    let encounter = conn
        .query_row(
            "SELECT id, name, round, current_turn_index, is_active, created_at
             FROM encounters WHERE is_active = 1 LIMIT 1",
            [],
            Encounter::from_row,
        )
        .optional()?;

    match encounter {
        Some(enc) => {
            let mut stmt = conn.prepare(
                "SELECT id, encounter_id, token_id, name, initiative, hp_current,
                        hp_max, temp_hp, ac, is_monster, monster_compendium_id,
                        multiattack_profile, conditions_json, created_at
                 FROM active_combatants WHERE encounter_id = ?1
                 ORDER BY initiative DESC, name ASC",
            )?;
            let rows = stmt.query_map(params![enc.id], ActiveCombatant::from_row)?;
            let mut combatants = Vec::new();
            for c in rows {
                combatants.push(c?);
            }
            Ok(Some((enc, combatants)))
        }
        None => Ok(None),
    }
}

/// Advances to the next combatant turn in the initiative order.
/// When wrapping from the last to the first combatant, increments the round counter.
pub fn next_turn(
    conn: &Connection,
    ws_sender: Option<&broadcast::Sender<WsEvent>>,
    encounter_id: &str,
) -> Result<(Encounter, Vec<ActiveCombatant>), Box<dyn std::error::Error + Send + Sync>> {
    let (mut enc, combatants) = get_active_encounter(conn)?
        .ok_or_else(|| "No active encounter found".to_string())?;

    if enc.id != encounter_id {
        return Err("Encounter ID mismatch".into());
    }

    if combatants.is_empty() {
        return Ok((enc, combatants));
    }

    let next_index = (enc.current_turn_index + 1) % (combatants.len() as i32);
    let next_round = if next_index == 0 {
        enc.round + 1
    } else {
        enc.round
    };

    conn.execute(
        "UPDATE encounters SET current_turn_index = ?1, round = ?2 WHERE id = ?3",
        params![next_index, next_round, enc.id],
    )?;

    enc.current_turn_index = next_index;
    enc.round = next_round;

    let active_combatant_name = combatants
        .get(next_index as usize)
        .map(|c| c.name.clone())
        .unwrap_or_default();

    if let Some(sender) = ws_sender {
        let _ = sender.send(WsEvent::TurnAdvanced {
            encounter_id: enc.id.clone(),
            round: enc.round,
            current_turn_index: enc.current_turn_index,
            active_combatant_name,
        });
    }

    Ok((enc, combatants))
}

/// Reverts to the previous combatant turn in the initiative order.
pub fn prev_turn(
    conn: &Connection,
    ws_sender: Option<&broadcast::Sender<WsEvent>>,
    encounter_id: &str,
) -> Result<(Encounter, Vec<ActiveCombatant>), Box<dyn std::error::Error + Send + Sync>> {
    let (mut enc, combatants) = get_active_encounter(conn)?
        .ok_or_else(|| "No active encounter found".to_string())?;

    if enc.id != encounter_id {
        return Err("Encounter ID mismatch".into());
    }

    if combatants.is_empty() {
        return Ok((enc, combatants));
    }

    let len = combatants.len() as i32;
    let prev_index = if enc.current_turn_index == 0 {
        len - 1
    } else {
        enc.current_turn_index - 1
    };
    let prev_round = if enc.current_turn_index == 0 && enc.round > 1 {
        enc.round - 1
    } else {
        enc.round
    };

    conn.execute(
        "UPDATE encounters SET current_turn_index = ?1, round = ?2 WHERE id = ?3",
        params![prev_index, prev_round, enc.id],
    )?;

    enc.current_turn_index = prev_index;
    enc.round = prev_round;

    let active_combatant_name = combatants
        .get(prev_index as usize)
        .map(|c| c.name.clone())
        .unwrap_or_default();

    if let Some(sender) = ws_sender {
        let _ = sender.send(WsEvent::TurnAdvanced {
            encounter_id: enc.id.clone(),
            round: enc.round,
            current_turn_index: enc.current_turn_index,
            active_combatant_name,
        });
    }

    Ok((enc, combatants))
}

/// Adjusts combatant HP (healing or damage) and broadcasts HP_UPDATE to all peers.
pub fn adjust_combatant_hp(
    conn: &Connection,
    ws_sender: Option<&broadcast::Sender<WsEvent>>,
    combatant_id: &str,
    delta_hp: i32,
) -> Result<ActiveCombatant, Box<dyn std::error::Error + Send + Sync>> {
    let mut combatant: ActiveCombatant = conn.query_row(
        "SELECT id, encounter_id, token_id, name, initiative, hp_current,
                hp_max, temp_hp, ac, is_monster, monster_compendium_id,
                multiattack_profile, conditions_json, created_at
         FROM active_combatants WHERE id = ?1",
        params![combatant_id],
        ActiveCombatant::from_row,
    )?;

    combatant.hp_current = (combatant.hp_current + delta_hp).clamp(0, combatant.hp_max);

    conn.execute(
        "UPDATE active_combatants SET hp_current = ?1 WHERE id = ?2",
        params![combatant.hp_current, combatant.id],
    )?;

    if let Some(sender) = ws_sender {
        let _ = sender.send(WsEvent::HpUpdate {
            character_id: combatant.token_id.clone(),
            current_hp: combatant.hp_current,
            temp_hp: combatant.temp_hp,
        });
    }

    Ok(combatant)
}

/// Adds or removes a status condition (e.g. "Blinded", "Poisoned", "Paralyzed") on an active combatant.
pub fn toggle_combatant_condition(
    conn: &Connection,
    combatant_id: &str,
    condition: &str,
) -> Result<ActiveCombatant, Box<dyn std::error::Error + Send + Sync>> {
    let mut combatant: ActiveCombatant = conn.query_row(
        "SELECT id, encounter_id, token_id, name, initiative, hp_current,
                hp_max, temp_hp, ac, is_monster, monster_compendium_id,
                multiattack_profile, conditions_json, created_at
         FROM active_combatants WHERE id = ?1",
        params![combatant_id],
        ActiveCombatant::from_row,
    )?;

    if let Some(pos) = combatant.conditions.iter().position(|c| c == condition) {
        combatant.conditions.remove(pos);
    } else {
        combatant.conditions.push(condition.to_string());
    }

    let conditions_json = serde_json::to_string(&combatant.conditions)?;

    conn.execute(
        "UPDATE active_combatants SET conditions_json = ?1 WHERE id = ?2",
        params![conditions_json, combatant.id],
    )?;

    Ok(combatant)
}

/// Drops a monster from the compendium onto the tactical canvas:
/// 1. Queries monster stat-block from SQLite.
/// 2. Generates unique runtime `token_id`.
/// 3. Inserts runtime combatant into `active_combatants` table.
/// 4. Broadcasts `SPAWN_TOKEN` WebSocket payload across all connected views.
pub fn spawn_combatant_token(
    conn: &Connection,
    ws_sender: Option<&broadcast::Sender<WsEvent>>,
    req: SpawnCombatantRequest,
) -> Result<SpawnCombatantResponse, Box<dyn std::error::Error + Send + Sync>> {
    let monster = MonsterStatBlock::find_by_id(conn, &req.monster_compendium_id)?
        .ok_or_else(|| format!("Monster '{}' not found in compendium", req.monster_compendium_id))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let random_suffix = (now % 100000) as u32;
    let combatant_id = format!("combatant-{}-{}", monster.id, random_suffix);
    let token_id = format!("token-{}-{}", monster.id, random_suffix);
    let name = req.custom_name.unwrap_or_else(|| monster.name.clone());
    let initiative = req.initiative.unwrap_or_else(|| {
        // Roll d20 + 1 initiative baseline
        let roll = ((now % 20) + 1) as i32;
        roll + 1
    });

    let combatant = ActiveCombatant {
        id: combatant_id.clone(),
        encounter_id: req.encounter_id.clone(),
        token_id: token_id.clone(),
        name: name.clone(),
        initiative,
        hp_current: monster.hp_max,
        hp_max: monster.hp_max,
        temp_hp: 0,
        ac: monster.ac,
        is_monster: true,
        monster_compendium_id: Some(monster.id.clone()),
        multiattack_profile: Some(monster.multiattack_profile.clone()),
        conditions: Vec::new(),
        created_at: now,
    };

    conn.execute(
        "INSERT INTO active_combatants (
            id, encounter_id, token_id, name, initiative, hp_current,
            hp_max, temp_hp, ac, is_monster, monster_compendium_id,
            multiattack_profile, conditions_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            combatant.id,
            combatant.encounter_id,
            combatant.token_id,
            combatant.name,
            combatant.initiative,
            combatant.hp_current,
            combatant.hp_max,
            combatant.temp_hp,
            combatant.ac,
            if combatant.is_monster { 1 } else { 0 },
            combatant.monster_compendium_id,
            combatant.multiattack_profile,
            serde_json::to_string(&combatant.conditions)?,
            combatant.created_at,
        ],
    )?;

    // Broadcast SPAWN_TOKEN over WebSocket hub
    if let Some(sender) = ws_sender {
        let _ = sender.send(WsEvent::SpawnToken {
            id: token_id.clone(),
            name: name.clone(),
            x: req.canvas_x,
            y: req.canvas_y,
            radius: if monster.size == "Large" { 30.0 } else { 22.0 },
            sight_radius: 280.0,
            darkvision_radius: 280.0,
            is_orb_sealed: false,
            tint: 0xef4444, // Monster red tint
            ac: monster.ac,
            hp_current: monster.hp_max,
            hp_max: monster.hp_max,
        });
    }

    Ok(SpawnCombatantResponse {
        combatant,
        token_id,
        canvas_x: req.canvas_x,
        canvas_y: req.canvas_y,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_in_memory_db;

    #[test]
    fn test_encounter_turn_progression_and_round_increments() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        // Seed 3 combatants
        conn.execute(
            "INSERT INTO active_combatants (id, encounter_id, token_id, name, initiative, hp_current, hp_max, temp_hp, ac, is_monster, conditions_json, created_at)
             VALUES
             ('c1', 'encounter-001', 't1', 'Aiden Paladin', 22, 45, 45, 0, 18, 0, '[]', 1700000000),
             ('c2', 'encounter-001', 't2', 'Goblin Scout', 15, 7, 7, 0, 15, 1, '[]', 1700000000),
             ('c3', 'encounter-001', 't3', 'Lyra Cleric', 10, 28, 28, 0, 16, 0, '[]', 1700000000)",
            [],
        ).unwrap();

        let (enc0, combatants) = get_active_encounter(&conn).unwrap().unwrap();
        assert_eq!(enc0.round, 1);
        assert_eq!(enc0.current_turn_index, 0);
        assert_eq!(combatants.len(), 3);
        assert_eq!(combatants[0].name, "Aiden Paladin");

        // Advance turn 0 -> turn 1 (Goblin Scout)
        let (enc1, _) = next_turn(&conn, None, "encounter-001").unwrap();
        assert_eq!(enc1.round, 1);
        assert_eq!(enc1.current_turn_index, 1);

        // Advance turn 1 -> turn 2 (Lyra Cleric)
        let (enc2, _) = next_turn(&conn, None, "encounter-001").unwrap();
        assert_eq!(enc2.round, 1);
        assert_eq!(enc2.current_turn_index, 2);

        // Advance turn 2 -> loops to turn 0 and increments Round to 2!
        let (enc3, _) = next_turn(&conn, None, "encounter-001").unwrap();
        assert_eq!(enc3.round, 2);
        assert_eq!(enc3.current_turn_index, 0);

        // Test HP adjustment
        let damaged = adjust_combatant_hp(&conn, None, "c1", -10).unwrap();
        assert_eq!(damaged.hp_current, 35);

        // Test condition toggling
        let with_cond = toggle_combatant_condition(&conn, "c1", "Poisoned").unwrap();
        assert!(with_cond.conditions.contains(&"Poisoned".to_string()));

        let without_cond = toggle_combatant_condition(&conn, "c1", "Poisoned").unwrap();
        assert!(!without_cond.conditions.contains(&"Poisoned".to_string()));
    }

    #[test]
    fn test_spawn_combatant_token_from_compendium() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let req = SpawnCombatantRequest {
            encounter_id: "encounter-001".to_string(),
            monster_compendium_id: "owlbear".to_string(),
            custom_name: Some("Gnarled Forest Owlbear".to_string()),
            initiative: Some(18),
            canvas_x: 450.0,
            canvas_y: 320.0,
        };

        let response = spawn_combatant_token(&conn, None, req).unwrap();
        assert_eq!(response.combatant.name, "Gnarled Forest Owlbear");
        assert_eq!(response.combatant.ac, 13);
        assert_eq!(response.combatant.hp_max, 59);
        assert_eq!(response.combatant.hp_current, 59);
        assert!(response.combatant.is_monster);
        assert!(response.token_id.starts_with("token-owlbear-"));
    }
}
