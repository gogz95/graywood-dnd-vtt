use crate::server::error::ServerError;
use crate::server::state::AppState;
use crate::systems::encounter::{
    adjust_combatant_hp, get_active_encounter, next_turn, prev_turn, spawn_combatant_token,
    toggle_combatant_condition, ActiveCombatant, Encounter, MonsterStatBlock,
    SpawnCombatantRequest, SpawnCombatantResponse,
};
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ActiveEncounterResponse {
    pub success: bool,
    pub encounter: Option<Encounter>,
    pub combatants: Vec<ActiveCombatant>,
}

#[derive(Debug, Deserialize)]
pub struct EncounterTurnRequest {
    pub encounter_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AdjustHpRequest {
    pub combatant_id: String,
    pub delta_hp: i32,
}

#[derive(Debug, Deserialize)]
pub struct ToggleConditionRequest {
    pub combatant_id: String,
    pub condition: String,
}

#[derive(Debug, Serialize)]
pub struct MonstersListResponse {
    pub success: bool,
    pub count: usize,
    pub monsters: Vec<MonsterStatBlock>,
}

#[derive(Debug, Serialize)]
pub struct CombatantMutationResponse {
    pub success: bool,
    pub combatant: ActiveCombatant,
}

/// GET /api/encounter/active
/// Returns active combat encounter and sorted combatant initiative list.
pub async fn get_active(
    State(state): State<AppState>,
) -> Result<Json<ActiveEncounterResponse>, ServerError> {
    let conn = state.db.lock().await;

    let result = get_active_encounter(&conn)?;

    match result {
        Some((encounter, combatants)) => Ok(Json(ActiveEncounterResponse {
            success: true,
            encounter: Some(encounter),
            combatants,
        })),
        None => Ok(Json(ActiveEncounterResponse {
            success: true,
            encounter: None,
            combatants: Vec::new(),
        })),
    }
}

/// POST /api/encounter/next_turn
/// Advances the active turn in initiative order, incrementing the round when rolling over.
pub async fn advance_turn(
    State(state): State<AppState>,
    Json(payload): Json<EncounterTurnRequest>,
) -> Result<Json<ActiveEncounterResponse>, ServerError> {
    let conn = state.db.lock().await;

    let (encounter, combatants) = next_turn(&conn, Some(&state.ws_sender), &payload.encounter_id)
        .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(ActiveEncounterResponse {
        success: true,
        encounter: Some(encounter),
        combatants,
    }))
}

/// POST /api/encounter/prev_turn
/// Reverts to the previous turn in initiative order.
pub async fn rewind_turn(
    State(state): State<AppState>,
    Json(payload): Json<EncounterTurnRequest>,
) -> Result<Json<ActiveEncounterResponse>, ServerError> {
    let conn = state.db.lock().await;

    let (encounter, combatants) = prev_turn(&conn, Some(&state.ws_sender), &payload.encounter_id)
        .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(ActiveEncounterResponse {
        success: true,
        encounter: Some(encounter),
        combatants,
    }))
}

/// POST /api/encounter/adjust_hp
/// Modifies combatant HP and broadcasts HP_UPDATE across the WebSocket hub.
pub async fn modify_hp(
    State(state): State<AppState>,
    Json(payload): Json<AdjustHpRequest>,
) -> Result<Json<CombatantMutationResponse>, ServerError> {
    let conn = state.db.lock().await;

    let combatant = adjust_combatant_hp(
        &conn,
        Some(&state.ws_sender),
        &payload.combatant_id,
        payload.delta_hp,
    )
    .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(CombatantMutationResponse {
        success: true,
        combatant,
    }))
}

/// POST /api/encounter/toggle_condition
/// Toggles condition tag on an active combatant (e.g., Poisoned, Blinded, Stunned).
pub async fn toggle_condition(
    State(state): State<AppState>,
    Json(payload): Json<ToggleConditionRequest>,
) -> Result<Json<CombatantMutationResponse>, ServerError> {
    let conn = state.db.lock().await;

    let combatant = toggle_combatant_condition(&conn, &payload.combatant_id, &payload.condition)
        .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(CombatantMutationResponse {
        success: true,
        combatant,
    }))
}

/// GET /api/encounter/monsters
/// Returns all compendium monster statblocks for DM selection.
pub async fn get_monsters(
    State(state): State<AppState>,
) -> Result<Json<MonstersListResponse>, ServerError> {
    let conn = state.db.lock().await;

    let monsters = MonsterStatBlock::list_all(&conn)?;
    let count = monsters.len();

    Ok(Json(MonstersListResponse {
        success: true,
        count,
        monsters,
    }))
}

/// POST /api/encounter/spawn_token
/// Spawns a monster onto the tactical canvas, persists in active_combatants, and broadcasts SPAWN_TOKEN.
pub async fn spawn_token(
    State(state): State<AppState>,
    Json(payload): Json<SpawnCombatantRequest>,
) -> Result<Json<SpawnCombatantResponse>, ServerError> {
    let conn = state.db.lock().await;

    let response = spawn_combatant_token(&conn, Some(&state.ws_sender), payload)
        .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(response))
}
