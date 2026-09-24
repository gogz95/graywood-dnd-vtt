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
    },

    #[serde(rename = "SYSTEM_MESSAGE")]
    SystemMessage { message: String, timestamp: i64 },

    #[serde(rename = "DATE_ADVANCED")]
    DateAdvanced {
        epoch_days: u64,
        days_advanced: u32,
        date_formatted: String,
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
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ws_sender.subscribe();

    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            match serde_json::to_string(&event) {
                Ok(json_str) => {
                    if sender.send(Message::Text(json_str)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let broadcast_tx = state.ws_sender.clone();
    let db = state.db.clone();
    let companion_hub = state.companion_hub.clone();

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
                            _ => {}
                        }

                        // Broadcast the event to all subscribers in the hub
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
