use crate::server::state::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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

    #[serde(rename = "LEASE_RELEASED")]
    LeaseReleased { token_id: String },

    #[serde(rename = "LEASE_ACQUIRE")]
    LeaseAcquire { token_id: String, user_id: String },

    #[serde(rename = "LEASE_RELEASE")]
    LeaseRelease { token_id: String, user_id: String },

    #[serde(
        rename = "STATE_SNAPSHOT",
        alias = "StateSnapshot",
        alias = "tokens:snapshot"
    )]
    StateSnapshot { tokens: Vec<serde_json::Value> },

    #[serde(rename = "SCENE_UPDATE", alias = "SceneUpdate", alias = "scene:update")]
    SceneUpdate {
        scene_id: String,
        #[serde(default)]
        tokens: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        drawings: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        fog: Option<serde_json::Value>,
        #[serde(default)]
        walls: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        notes: Option<Vec<serde_json::Value>>,
    },

    #[serde(rename = "FOG_UPDATE", alias = "FogUpdate", alias = "fog:update")]
    FogUpdate {
        scene_id: String,
        fog: serde_json::Value,
    },
}

#[derive(Debug, Deserialize, Default)]
pub struct WsQuery {
    pub pin: Option<String>,
    pub role: Option<String>,
    pub session_id: Option<String>,
    pub user_id: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, query))
}

fn is_token_secret(t: &serde_json::Value) -> bool {
    t.get("is_hidden")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || t.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false)
        || t.get("invisible")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        || t.get("isGmOnly").and_then(|v| v.as_bool()).unwrap_or(false)
        || t.get("is_gm_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        || t.get("isVisible").and_then(|v| v.as_bool()) == Some(false)
        || t.get("is_visible").and_then(|v| v.as_bool()) == Some(false)
        || t.get("name")
            .and_then(|v| v.as_str())
            .map(|n| {
                let lower = n.to_lowercase();
                lower.contains("(hidden)") || lower.contains("[secret]")
            })
            .unwrap_or(false)
}

fn is_drawing_secret(d: &serde_json::Value) -> bool {
    d.get("layer").and_then(|v| v.as_str()) == Some("dm")
        || d.get("isSecret").and_then(|v| v.as_bool()).unwrap_or(false)
        || d.get("is_secret")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
}

fn is_note_secret(n: &serde_json::Value) -> bool {
    n.get("is_secret")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || n.get("isSecret").and_then(|v| v.as_bool()).unwrap_or(false)
        || n.get("dm_only").and_then(|v| v.as_bool()).unwrap_or(false)
        || n.get("layer").and_then(|v| v.as_str()) == Some("dm")
}

fn is_wall_unrevealed_or_secret(w: &serde_json::Value) -> bool {
    w.get("is_secret")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || w.get("isSecret").and_then(|v| v.as_bool()).unwrap_or(false)
        || w.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false)
        || w.get("is_hidden")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        || w.get("is_unrevealed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        || w.get("revealed").and_then(|v| v.as_bool()) == Some(false)
}

fn sanitize_fog_for_player(fog: &serde_json::Value) -> serde_json::Value {
    match fog {
        serde_json::Value::Object(map) => {
            let mut cleaned = serde_json::Map::new();
            for (k, v) in map {
                if k == "unrevealed"
                    || k == "unrevealed_coords"
                    || k == "unrevealed_polygons"
                    || k == "secret_fog"
                    || k == "hidden_polygons"
                    || k == "unexplored_regions"
                {
                    continue;
                }
                cleaned.insert(k.clone(), v.clone());
            }
            serde_json::Value::Object(cleaned)
        }
        _ => fog.clone(),
    }
}

pub fn sanitize_event_for_player(event: &WsEvent) -> Option<WsEvent> {
    match event {
        WsEvent::DrawingUpdate {
            action,
            drawing,
            drawings,
            drawing_id,
            layer,
        } => {
            if layer.as_deref() == Some("dm") {
                return None;
            }
            if let Some(d) = drawing {
                if is_drawing_secret(d) {
                    return None;
                }
            }
            if let Some(ds) = drawings {
                let filtered: Vec<serde_json::Value> = ds
                    .iter()
                    .filter(|d| !is_drawing_secret(d))
                    .cloned()
                    .collect();
                if filtered.is_empty() {
                    return None;
                }
                return Some(WsEvent::DrawingUpdate {
                    action: action.clone(),
                    drawing: None,
                    drawings: Some(filtered),
                    drawing_id: drawing_id.clone(),
                    layer: layer.clone(),
                });
            }
            Some(event.clone())
        }
        WsEvent::SpawnToken { name, .. } => {
            let lower = name.to_lowercase();
            if lower.contains("(hidden)") || lower.contains("[secret]") {
                None
            } else {
                Some(event.clone())
            }
        }
        WsEvent::StateSnapshot { tokens } => {
            let filtered: Vec<serde_json::Value> = tokens
                .iter()
                .filter(|t| !is_token_secret(t))
                .cloned()
                .collect();
            Some(WsEvent::StateSnapshot { tokens: filtered })
        }
        WsEvent::SceneUpdate {
            scene_id,
            tokens,
            drawings,
            fog,
            walls,
            notes,
        } => {
            let filtered_tokens = tokens.as_ref().map(|list| {
                list.iter()
                    .filter(|t| !is_token_secret(t))
                    .cloned()
                    .collect()
            });
            let filtered_drawings = drawings.as_ref().map(|list| {
                list.iter()
                    .filter(|d| !is_drawing_secret(d))
                    .cloned()
                    .collect()
            });
            let filtered_notes = notes.as_ref().map(|list| {
                list.iter()
                    .filter(|n| !is_note_secret(n))
                    .cloned()
                    .collect()
            });
            let filtered_walls = walls.as_ref().map(|list| {
                list.iter()
                    .filter(|w| !is_wall_unrevealed_or_secret(w))
                    .cloned()
                    .collect()
            });
            let sanitized_fog = fog.as_ref().map(|f| sanitize_fog_for_player(f));

            Some(WsEvent::SceneUpdate {
                scene_id: scene_id.clone(),
                tokens: filtered_tokens,
                drawings: filtered_drawings,
                fog: sanitized_fog,
                walls: filtered_walls,
                notes: filtered_notes,
            })
        }
        WsEvent::FogUpdate { scene_id, fog } => Some(WsEvent::FogUpdate {
            scene_id: scene_id.clone(),
            fog: sanitize_fog_for_player(fog),
        }),
        _ => Some(event.clone()),
    }
}

async fn handle_socket(socket: WebSocket, state: AppState, query: WsQuery) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ws_sender.subscribe();

    let initial_is_dm = match query.role.as_deref() {
        Some("player") | Some("companion") | Some("spectator") => false,
        Some("dm") | Some("owner_dm") | Some("assistant_dm") => true,
        _ => {
            if let Some(ref pin) = query.pin {
                if let Ok(conn) = state.db.try_lock() {
                    let is_player_pin = conn
                        .prepare("SELECT 1 FROM characters WHERE pin = ?1 LIMIT 1")
                        .ok()
                        .map(|mut s| s.exists(rusqlite::params![pin]).unwrap_or(false))
                        .unwrap_or(false);
                    !is_player_pin
                } else {
                    true
                }
            } else {
                true
            }
        }
    };

    let is_dm = Arc::new(AtomicBool::new(initial_is_dm));
    let is_dm_send = is_dm.clone();
    let client_user_id = Arc::new(tokio::sync::RwLock::new(query.user_id.or(query.session_id)));
    let client_user_id_recv = client_user_id.clone();
    let client_user_id_cleanup = client_user_id.clone();

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
                Ok(event) => {
                    let client_is_dm = is_dm_send.load(Ordering::Relaxed);
                    let outbound = if client_is_dm {
                        Some(event)
                    } else {
                        sanitize_event_for_player(&event)
                    };

                    if let Some(ev) = outbound {
                        match serde_json::to_string(&ev) {
                            Ok(json_str) => {
                                if sender.send(Message::Text(json_str)).await.is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                }
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
    let lease_map = state.lease_map.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(raw_val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if raw_val.get("type").and_then(|t| t.as_str()) == Some("AUTH_REQUEST") {
                            if let Some(pin) = raw_val.get("pin").and_then(|p| p.as_str()) {
                                if pin != "1337" && pin != "dm" {
                                    is_dm.store(false, Ordering::Relaxed);
                                }
                            }
                        }
                    }

                    if let Ok(event) = serde_json::from_str::<WsEvent>(&text) {
                        // If the event affects persisted state, update SQLite asynchronously
                        match &event {
                            WsEvent::LeaseAcquire { token_id, user_id } => {
                                {
                                    let mut uid_guard = client_user_id_recv.write().await;
                                    *uid_guard = Some(user_id.clone());
                                }
                                crate::state::lease::acquire_lease(&lease_map, token_id, user_id)
                                    .await;
                            }
                            WsEvent::LeaseRelease { token_id, user_id } => {
                                if crate::state::lease::release_lease(
                                    &lease_map,
                                    token_id,
                                    Some(user_id),
                                )
                                .await
                                {
                                    let _ = broadcast_tx.send(WsEvent::LeaseReleased {
                                        token_id: token_id.clone(),
                                    });
                                    companion_hub.broadcast(
                                        crate::server::companion_hub::CompanionServerMsg::LeaseReleased {
                                            token_id: token_id.clone(),
                                        },
                                    );
                                }
                            }
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

    // Clean up all token leases held by this connection on disconnect
    {
        let uid_guard = client_user_id_cleanup.read().await;
        if let Some(ref uid) = *uid_guard {
            let released = crate::state::lease::release_all_for_user(&state.lease_map, uid).await;
            for token_id in released {
                let _ = state.ws_sender.send(WsEvent::LeaseReleased {
                    token_id: token_id.clone(),
                });
                state.companion_hub.broadcast(
                    crate::server::companion_hub::CompanionServerMsg::LeaseReleased { token_id },
                );
            }
        }
    }
}
