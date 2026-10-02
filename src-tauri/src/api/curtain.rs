use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use std::sync::atomic::Ordering;

use crate::server::{companion_hub::CompanionServerMsg, routes::ws::WsEvent, state::AppState};

#[derive(Debug, Deserialize)]
pub struct CurtainRequest {
    pub active: bool,
    #[serde(default)]
    pub splash_image_url: Option<String>,
}

pub async fn set_curtain(
    State(state): State<AppState>,
    Json(body): Json<CurtainRequest>,
) -> StatusCode {
    state.curtain_active.store(body.active, Ordering::Relaxed);

    // Broadcast to primary WebSocket clients (projector, DM canvas, etc.)
    let ws_event = WsEvent::ProjectorCurtainState {
        active: body.active,
        splash_image_url: body.splash_image_url.clone(),
    };
    let staging_event = WsEvent::StagingCurtain {
        active: body.active,
    };
    {
        let mut buf = state.epoch_buffer.write().await;
        buf.push_event(staging_event.clone());
        buf.push_event(ws_event.clone());
    }
    let _ = state.ws_sender.send(staging_event);
    let _ = state.ws_sender.send(ws_event);

    // Broadcast to companion hub clients (mobile player companion)
    state
        .companion_hub
        .broadcast(CompanionServerMsg::StagingCurtain {
            active: body.active,
        });
    state
        .companion_hub
        .broadcast(CompanionServerMsg::ProjectorCurtainState {
            active: body.active,
            splash_image_url: body.splash_image_url,
        });

    StatusCode::NO_CONTENT
}
