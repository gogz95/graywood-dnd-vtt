// src-tauri/src/api/sync.rs
// GET /api/sync/epoch?since={u64}
// Returns missed WsEvents or 410 Gone when a full snapshot is required.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::server::{routes::ws::WsEvent, state::AppState};

#[derive(Debug, Deserialize)]
pub struct SinceQuery {
    pub since: u64,
}

#[derive(Debug, Serialize)]
pub struct EpochSyncResponse {
    pub current_epoch: u64,
    pub events: Vec<WsEvent>,
}

/// GET /api/sync/epoch?since=<u64>
///
/// Returns all events that occurred after `since`.
/// Returns HTTP 410 Gone when `since` has been evicted from the ring buffer
/// and the client must perform a full DB snapshot instead.
pub async fn get_epoch_delta(
    State(state): State<AppState>,
    Query(params): Query<SinceQuery>,
) -> Result<Json<EpochSyncResponse>, StatusCode> {
    let buf = state.epoch_buffer.read().await;

    match buf.get_missed_events(params.since) {
        Some(events) => Ok(Json(EpochSyncResponse {
            current_epoch: buf.current_epoch,
            events,
        })),
        // Buffer evicted the requested epoch → client must do a full snapshot.
        None => Err(StatusCode::GONE),
    }
}
