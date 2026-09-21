use crate::models::{Character, InventoryItem};
use crate::server::error::ServerError;
use crate::server::routes::ws::WsEvent;
use crate::server::state::{AppState, DEFAULT_TOKEN_TTL_SECONDS};
use axum::{extract::State, http::HeaderMap, Json};
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ClaimRequest {
    pub character_id: String,
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct ClaimResponse {
    pub success: bool,
    pub token: String,
    pub expires_at: i64,
    pub character: Character,
}

#[derive(Debug, Deserialize)]
pub struct CharacterActionRequest {
    pub character_id: String,
    pub pin: Option<String>,
    pub action: CharacterAction,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum CharacterAction {
    #[serde(rename = "MUTATE_HP")]
    MutateHp {
        current_hp: i32,
        temp_hp: Option<i32>,
    },
    #[serde(rename = "SPEND_SPELL_SLOT")]
    SpendSpellSlot { slot_level: u8 },
    #[serde(rename = "RESTORE_SPELL_SLOTS")]
    RestoreSpellSlots,
    #[serde(rename = "TOGGLE_BLACK_ORB")]
    ToggleBlackOrb { is_orb_sealed: bool },
    #[serde(rename = "TOGGLE_INVENTORY_PRESERVED")]
    ToggleInventoryPreserved { item_id: String, is_preserved: bool },
}

#[derive(Debug, Serialize)]
pub struct ActionResponse {
    pub success: bool,
    pub message: String,
    pub character: Character,
}

/// POST /api/characters/claim
/// Validates the 4-digit PIN against SQLite, returning a signed session token.
pub async fn claim_character(
    State(state): State<AppState>,
    Json(payload): Json<ClaimRequest>,
) -> Result<Json<ClaimResponse>, ServerError> {
    if !Character::validate_pin(&payload.pin) {
        return Err(ServerError::InvalidPin);
    }

    let conn = state.db.lock().await;
    let character = Character::find_by_id(&conn, &payload.character_id)?.ok_or_else(|| {
        ServerError::NotFound(format!("Character '{}' not found", payload.character_id))
    })?;

    if character.pin != payload.pin {
        return Err(ServerError::InvalidPin);
    }

    let (token, expires_at) = state.generate_token(&character.id, DEFAULT_TOKEN_TTL_SECONDS)?;

    Ok(Json(ClaimResponse {
        success: true,
        token,
        expires_at,
        character,
    }))
}

/// Helper to authenticate character request via Authorization header, X-Character-PIN header, or body PIN.
fn authenticate_character(
    headers: &HeaderMap,
    body_pin: Option<&str>,
    target_character_id: &str,
    state: &AppState,
    conn: &rusqlite::Connection,
) -> Result<(), ServerError> {
    // 1. Check Bearer token in Authorization header
    if let Some(auth_val) = headers.get("Authorization") {
        if let Ok(auth_str) = auth_val.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                let token_char_id = state.verify_token(token.trim())?;
                if token_char_id == target_character_id {
                    return Ok(());
                }
            }
        }
    }

    // 2. Check X-Character-PIN header
    if let Some(pin_val) = headers.get("X-Character-PIN") {
        if let Ok(pin_str) = pin_val.to_str() {
            if Character::verify_pin(conn, target_character_id, pin_str.trim())? {
                return Ok(());
            }
        }
    }

    // 3. Check PIN in request body
    if let Some(pin) = body_pin {
        if Character::verify_pin(conn, target_character_id, pin.trim())? {
            return Ok(());
        }
    }

    Err(ServerError::Unauthorized(
        "Authentication failed: invalid or missing PIN / session token".to_string(),
    ))
}

/// POST /api/characters/action
/// Authenticates the request and performs HP mutation, spell slot updates, or inventory toggling.
pub async fn execute_character_action(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<CharacterActionRequest>,
) -> Result<Json<ActionResponse>, ServerError> {
    let conn = state.db.lock().await;

    authenticate_character(
        &headers,
        payload.pin.as_deref(),
        &payload.character_id,
        &state,
        &conn,
    )?;

    let mut character = Character::find_by_id(&conn, &payload.character_id)?.ok_or_else(|| {
        ServerError::NotFound(format!("Character '{}' not found", payload.character_id))
    })?;

    match payload.action {
        CharacterAction::MutateHp {
            current_hp,
            temp_hp,
        } => {
            character.current_hp = current_hp;
            if let Some(thp) = temp_hp {
                character.temp_hp = thp;
            }

            conn.execute(
                "UPDATE characters SET current_hp = ?1, temp_hp = ?2 WHERE id = ?3",
                params![character.current_hp, character.temp_hp, character.id],
            )?;

            // Broadcast HP_UPDATE event to WebSocket subscribers
            let _ = state.ws_sender.send(WsEvent::HpUpdate {
                character_id: character.id.clone(),
                current_hp: character.current_hp,
                temp_hp: character.temp_hp,
            });
        }
        CharacterAction::SpendSpellSlot { slot_level } => {
            let mut slots = character.parse_spell_slots().unwrap_or_default();
            let pool = match slot_level {
                1 => &mut slots.level_1,
                2 => &mut slots.level_2,
                3 => &mut slots.level_3,
                4 => &mut slots.level_4,
                5 => &mut slots.level_5,
                6 => &mut slots.level_6,
                7 => &mut slots.level_7,
                8 => &mut slots.level_8,
                9 => &mut slots.level_9,
                _ => {
                    return Err(ServerError::BadRequest(format!(
                        "Invalid spell slot level: {}",
                        slot_level
                    )))
                }
            };

            if pool.used >= pool.max {
                return Err(ServerError::BadRequest(format!(
                    "No available spell slots remaining at level {}",
                    slot_level
                )));
            }

            pool.used += 1;
            character.spell_slots_json = serde_json::to_string(&slots)?;

            conn.execute(
                "UPDATE characters SET spell_slots_json = ?1 WHERE id = ?2",
                params![character.spell_slots_json, character.id],
            )?;
        }
        CharacterAction::RestoreSpellSlots => {
            let mut slots = character.parse_spell_slots().unwrap_or_default();
            slots.level_1.used = 0;
            slots.level_2.used = 0;
            slots.level_3.used = 0;
            slots.level_4.used = 0;
            slots.level_5.used = 0;
            slots.level_6.used = 0;
            slots.level_7.used = 0;
            slots.level_8.used = 0;
            slots.level_9.used = 0;

            character.spell_slots_json = serde_json::to_string(&slots)?;

            conn.execute(
                "UPDATE characters SET spell_slots_json = ?1 WHERE id = ?2",
                params![character.spell_slots_json, character.id],
            )?;
        }
        CharacterAction::ToggleBlackOrb { is_orb_sealed } => {
            character.is_orb_sealed = is_orb_sealed;

            conn.execute(
                "UPDATE characters SET is_orb_sealed = ?1 WHERE id = ?2",
                params![if is_orb_sealed { 1 } else { 0 }, character.id],
            )?;

            // Broadcast BLACK_ORB_TOGGLE event to WebSocket subscribers
            let _ = state.ws_sender.send(WsEvent::BlackOrbToggle {
                character_id: character.id.clone(),
                is_orb_sealed,
            });
        }
        CharacterAction::ToggleInventoryPreserved {
            item_id,
            is_preserved,
        } => {
            let item = InventoryItem::find_by_id(&conn, &item_id)?.ok_or_else(|| {
                ServerError::NotFound(format!("Inventory item '{}' not found", item_id))
            })?;

            if item.character_id != character.id {
                return Err(ServerError::Unauthorized(
                    "Item does not belong to the claimed character".to_string(),
                ));
            }

            conn.execute(
                "UPDATE inventory_items SET is_preserved = ?1 WHERE id = ?2",
                params![if is_preserved { 1 } else { 0 }, item_id],
            )?;
        }
    }

    Ok(Json(ActionResponse {
        success: true,
        message: "Character action executed successfully".to_string(),
        character,
    }))
}
