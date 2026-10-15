use crate::models::crafting::{
    evaluate_crafting_matrix, CraftingEvaluation, ElementalEssence, ItemSocket,
};
use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct EssencesListResponse {
    pub success: bool,
    pub count: usize,
    pub essences: Vec<ElementalEssence>,
}

#[derive(Debug, Deserialize)]
pub struct EvaluateCraftingRequest {
    pub essence_ids: Vec<String>,
    pub has_alchemical_lab: bool,
}

#[derive(Debug, Serialize)]
pub struct EvaluateCraftingResponse {
    pub success: bool,
    pub evaluation: CraftingEvaluation,
}

#[derive(Debug, Deserialize)]
pub struct SocketEssenceRequest {
    pub item_id: String,
    pub socket_index: i32,
    pub essence_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SocketsResponse {
    pub success: bool,
    pub item_id: String,
    pub sockets: Vec<ItemSocket>,
}

/// GET /api/crafting/essences
/// Returns all 28 elemental, para-elemental, quasi-elemental, and planar essences.
pub async fn list_essences(
    State(state): State<AppState>,
) -> Result<Json<EssencesListResponse>, ServerError> {
    let conn = state.db.lock().await;
    let essences = ElementalEssence::list_all(&conn)?;
    let count = essences.len();

    Ok(Json(EssencesListResponse {
        success: true,
        count,
        essences,
    }))
}

/// POST /api/crafting/evaluate
/// Evaluates the ingredient-point formula and lab stability check for a candidate set of essences.
pub async fn evaluate_matrix(
    State(state): State<AppState>,
    Json(payload): Json<EvaluateCraftingRequest>,
) -> Result<Json<EvaluateCraftingResponse>, ServerError> {
    let conn = state.db.lock().await;

    let mut essences = Vec::new();
    for id in &payload.essence_ids {
        if let Some(essence) = ElementalEssence::find_by_id(&conn, id)? {
            essences.push(essence);
        }
    }

    let evaluation = evaluate_crafting_matrix(&essences, payload.has_alchemical_lab);

    Ok(Json(EvaluateCraftingResponse {
        success: true,
        evaluation,
    }))
}

/// GET /api/crafting/sockets/:item_id
/// Returns all sockets and slotted essences for an equipment item.
pub async fn get_item_sockets(
    State(state): State<AppState>,
    Path(item_id): Path<String>,
) -> Result<Json<SocketsResponse>, ServerError> {
    let conn = state.db.lock().await;
    let sockets = ItemSocket::get_sockets_for_item(&conn, &item_id)?;

    Ok(Json(SocketsResponse {
        success: true,
        item_id,
        sockets,
    }))
}

/// POST /api/crafting/socket
/// Slots or extracts an elemental essence in an equipment socket.
pub async fn socket_essence(
    State(state): State<AppState>,
    Json(payload): Json<SocketEssenceRequest>,
) -> Result<Json<SocketsResponse>, ServerError> {
    let conn = state.db.lock().await;

    ItemSocket::set_socket_essence(
        &conn,
        &payload.item_id,
        payload.socket_index,
        payload.essence_id.as_deref(),
    )?;

    let sockets = ItemSocket::get_sockets_for_item(&conn, &payload.item_id)?;

    Ok(Json(SocketsResponse {
        success: true,
        item_id: payload.item_id,
        sockets,
    }))
}
