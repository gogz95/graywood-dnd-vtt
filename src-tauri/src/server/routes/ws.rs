use crate::server::state::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsEvent {
    #[serde(rename = "TOKEN_MOVE")]
    TokenMove { id: String, x: f64, y: f64 },

    #[serde(rename = "HP_UPDATE")]
    HpUpdate {
        character_id: String,
        current_hp: i32,
        temp_hp: i32,
    },

    #[serde(rename = "BLACK_ORB_TOGGLE")]
    BlackOrbToggle {
        character_id: String,
        is_orb_sealed: bool,
    },

    #[serde(rename = "DICE_ROLL")]
    DiceRoll {
        character_id: String,
        formula: String,
        result: i32,
        is_critical: bool,
        #[serde(default)]
        seed: Option<u64>,
        #[serde(default)]
        vectors: Option<Vec<crate::server::companion_hub::DiceTrajectoryVector>>,
    },

    #[serde(rename = "SYSTEM_MESSAGE")]
    SystemMessage { message: String, timestamp: i64 },

    #[serde(rename = "DATE_ADVANCED")]
    DateAdvanced {
        epoch_days: u64,
        days_advanced: u32,
        date_formatted: String,
    },

    #[serde(rename = "TIME_UPDATE")]
    TimeUpdate {
        epoch_days: u64,
        current_epoch_seconds: u32, // 0 to 86,400 within current day
        seconds_advanced: u32,
        formatted_time: String,
    },

    #[serde(rename = "SPAWN_TOKEN")]
    SpawnToken {
        id: String,
        name: String,
        x: f64,
        y: f64,
        radius: f64,
        sight_radius: f64,
        darkvision_radius: f64,
        is_orb_sealed: bool,
        tint: u32,
        ac: i32,
        hp_current: i32,
        hp_max: i32,
    },

    #[serde(rename = "TURN_ADVANCED")]
    TurnAdvanced {
        encounter_id: String,
        round: i32,
        current_turn_index: i32,
        active_combatant_name: String,
    },

    #[serde(rename = "ENCOUNTER_UPDATED")]
    EncounterUpdated {
        encounter_id: String,
        round: i32,
        current_turn_index: i32,
    },

    #[serde(rename = "HANDOUT", alias = "Handout", alias = "handout")]
    Handout {
        id: String,
        title: String,
        content: String,
        image_url: Option<String>,
    },

    #[serde(rename = "PING_POINT", alias = "PingPoint", alias = "ping_point")]
    PingPoint {
        x: f32,
        y: f32,
        color: String,
        sender_name: String,
    },

    #[serde(rename = "CONCENTRATION_CHECK_REQUIRED")]
    ConcentrationCheckRequired {
        entity_id: String,
        entity_name: String,
        dc: i32,
        damage_taken: i32,
    },

    #[serde(rename = "DRAWING_UPDATE")]
    DrawingUpdate {
        action: String,
        #[serde(default)]
        drawing: Option<serde_json::Value>,
        #[serde(default)]
        drawings: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        drawing_id: Option<String>,
        #[serde(default)]
        layer: Option<String>,
    },

    #[serde(rename = "CHAT_MESSAGE", alias = "ChatMessage", alias = "chat_message")]
    ChatMessage {
        message: crate::server::companion_hub::ChatMessage,
    },

    #[serde(rename = "TOKEN_OWNER_ASSIGNED")]
    TokenOwnerAssigned {
        token_id: String,
        owner_ids: Vec<String>,
    },

    #[serde(rename = "AUTH_WARNING")]
    AuthWarning {
        reason: String,
        #[serde(default)]
        token_id: Option<String>,
    },

    #[serde(rename = "STAGING_CURTAIN")]
    StagingCurtain { active: bool },
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ws_sender.subscribe();

    let initial_curtain = state
        .curtain_active
        .load(std::sync::atomic::Ordering::Relaxed);
    let mut send_task = tokio::spawn(async move {
        let initial_event = WsEvent::StagingCurtain {
            active: initial_curtain,
        };
        if let Ok(json_str) = serde_json::to_string(&initial_event) {
            let _ = sender.send(Message::Text(json_str)).await;
        }

        loop {
            match rx.recv().await {
                Ok(event) => match serde_json::to_string(&event) {
                    Ok(json_str) => {
                        if sender.send(Message::Text(json_str)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                },
                Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
                    eprintln!("[ws] WebSocket client lagged, skipped {} messages", count);
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let broadcast_tx = state.ws_sender.clone();
    let db = state.db.clone();
    let companion_hub = state.companion_hub.clone();
    let epoch_buffer = state.epoch_buffer.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(event) = serde_json::from_str::<WsEvent>(&text) {
                        // If the event affects persisted state, update SQLite asynchronously
                        match &event {
                            WsEvent::HpUpdate {
                                character_id,
                                current_hp,
                                temp_hp,
                            } => {
                                let conn = db.lock().await;
                                let _ = conn.execute(
                                    "UPDATE characters SET current_hp = ?1, temp_hp = ?2 WHERE id = ?3",
                                    rusqlite::params![current_hp, temp_hp, character_id],
                                );
                            }
                            WsEvent::BlackOrbToggle {
                                character_id,
                                is_orb_sealed,
                            } => {
                                let conn = db.lock().await;
                                let _ = conn.execute(
                                    "UPDATE characters SET is_orb_sealed = ?1 WHERE id = ?2",
                                    rusqlite::params![
                                        if *is_orb_sealed { 1 } else { 0 },
                                        character_id
                                    ],
                                );
                            }
                            WsEvent::Handout {
                                id,
                                title,
                                content,
                                image_url,
                            } => {
                                companion_hub.broadcast(
                                    crate::server::companion_hub::CompanionServerMsg::Handout {
                                        id: id.clone(),
                                        title: title.clone(),
                                        content: content.clone(),
                                        image_url: image_url.clone(),
                                    },
                                );
                            }
                            WsEvent::PingPoint {
                                x,
                                y,
                                color,
                                sender_name,
                            } => {
                                companion_hub.broadcast(
                                    crate::server::companion_hub::CompanionServerMsg::PingPoint {
                                        x: *x,
                                        y: *y,
                                        color: color.clone(),
                                        sender_name: sender_name.clone(),
                                    },
                                );
                            }
                            WsEvent::ChatMessage { message } => {
                                companion_hub.broadcast(
                                    crate::server::companion_hub::CompanionServerMsg::Chat {
                                        message: message.clone(),
                                    },
                                );
                            }
                            _ => {}
                        }

                        // Stamp event with a monotonic epoch, then broadcast.
                        {
                            let mut buf = epoch_buffer.write().await;
                            buf.push_event(event.clone());
                        }
                        let _ = broadcast_tx.send(event);
                    }
                }
                Message::Close(_) => {
                    break;
                }
                Message::Ping(payload) => {
                    // Ping responses are automatically handled or can be answered
                    let _ = payload;
                }
                _ => {}
            }
        }
    });

    // If either sending or receiving fails, abort both to prevent resource leaks
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
