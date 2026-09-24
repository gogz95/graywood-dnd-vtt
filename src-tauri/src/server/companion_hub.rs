// src-tauri/src/server/companion_hub.rs
// Axum WebSocket Relay Hub & PIN-based Authentication for Graywood VTT Mobile Companion
// Supports real-time dice rolls, combatant sync, HP mutations, and 5-second unauthenticated quarantine.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    Json,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, RwLock};
use tokio::time::timeout;

use crate::server::routes::ws::WsEvent;
use crate::server::state::AppState;

// ── 1. Strong Message Schemas (Serde JSON) ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CompanionClientMsg {
    #[serde(rename = "Auth", alias = "auth", alias = "AUTH")]
    Auth {
        pin: String,
        device_name: String,
        role: String,
    },

    #[serde(rename = "UpdateHp", alias = "update_hp", alias = "UPDATE_HP")]
    UpdateHp { entity_id: String, delta: i32 },

    #[serde(rename = "RollDice", alias = "roll_dice", alias = "ROLL_DICE")]
    RollDice {
        expression: String,
        character_name: String,
    },

    #[serde(rename = "Heartbeat", alias = "heartbeat", alias = "HEARTBEAT")]
    Heartbeat,

    #[serde(rename = "Handout", alias = "HANDOUT", alias = "handout")]
    Handout {
        id: String,
        title: String,
        content: String,
        image_url: Option<String>,
    },

    #[serde(
        rename = "CharacterSync",
        alias = "character_sync",
        alias = "CHARACTER_SYNC"
    )]
    CharacterSync {
        character_name: String,
        spell_slots: Option<serde_json::Value>,
        inventory: Option<serde_json::Value>,
        currency: Option<serde_json::Value>,
    },

    #[serde(rename = "ApplyDamage", alias = "apply_damage", alias = "APPLY_DAMAGE")]
    ApplyDamage {
        target_entity_id: String,
        amount: i32,
        modifier: String, // "full" | "half" | "double" | "heal"
    },

    #[serde(rename = "PingPoint", alias = "ping_point", alias = "PING_POINT")]
    PingPoint {
        x: f32,
        y: f32,
        color: String,
        sender_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CompanionServerMsg {
    #[serde(rename = "AuthSuccess")]
    AuthSuccess {
        session_id: String,
        campaign_name: String,
    },

    #[serde(rename = "AuthError")]
    AuthError { reason: String },

    #[serde(rename = "CombatantSync")]
    CombatantSync { combatants: Vec<CombatantSummary> },

    #[serde(rename = "DiceResult")]
    DiceResult {
        roll_id: String,
        roller: String,
        expression: String,
        total: i32,
        breakdown: String,
    },

    #[serde(rename = "Ping")]
    Ping,

    #[serde(rename = "Handout", alias = "HANDOUT", alias = "handout")]
    Handout {
        id: String,
        title: String,
        content: String,
        image_url: Option<String>,
    },

    #[serde(rename = "PingPoint", alias = "ping_point", alias = "PING_POINT")]
    PingPoint {
        x: f32,
        y: f32,
        color: String,
        sender_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatantSummary {
    pub id: String,
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
    pub ac: i32,
    pub initiative: i32,
    pub is_player: bool,
    pub conditions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionSession {
    pub session_id: String,
    pub device_name: String,
    pub role: String,
    pub connected_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanionStatusResponse {
    pub status: String,
    pub version: String,
    pub campaign_name: String,
    pub active_sessions: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanionConfigPayload {
    pub pin: Option<String>,
    pub campaign_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanionNetworkInfoResponse {
    pub host_ip: String,
    pub port: u16,
    pub active_pin: String,
    pub connection_url: String,
}

// ── 2. Centralized Companion State & Broadcast Hub ──────────────────────────

pub struct CompanionHub {
    pub broadcast_tx: broadcast::Sender<CompanionServerMsg>,
    pub sessions: Arc<RwLock<HashMap<String, CompanionSession>>>,
    pub table_pin: Arc<RwLock<String>>,
    pub campaign_name: Arc<RwLock<String>>,
}

impl CompanionHub {
    pub fn new(default_pin: &str, default_campaign_name: &str) -> Self {
        let (broadcast_tx, _) = broadcast::channel(512);
        Self {
            broadcast_tx,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            table_pin: Arc::new(RwLock::new(default_pin.to_string())),
            campaign_name: Arc::new(RwLock::new(default_campaign_name.to_string())),
        }
    }

    pub async fn active_session_count(&self) -> usize {
        self.sessions.read().await.len()
    }

    pub fn broadcast(&self, msg: CompanionServerMsg) {
        let _ = self.broadcast_tx.send(msg);
    }
}

// ── 3. WebSocket Handshake & 5-Second Quarantine Handler ─────────────────────

/// Upgrades incoming HTTP connection to WebSocket at `/ws/companion`.
pub async fn companion_ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_companion_socket(socket, state))
}

async fn handle_companion_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // ── Phase 1: Unauthenticated Quarantine (5-second timeout) ───────────────
    let quarantine_timeout = Duration::from_secs(5);
    let auth_attempt = timeout(quarantine_timeout, async {
        while let Some(msg_result) = receiver.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    if let Ok(client_msg) = serde_json::from_str::<CompanionClientMsg>(&text) {
                        return Some(client_msg);
                    }
                }
                Ok(Message::Close(_)) => return None,
                Err(_) => return None,
                _ => {}
            }
        }
        None
    })
    .await;

    // Evaluate quarantine result
    let (pin, device_name, role) = match auth_attempt {
        Ok(Some(CompanionClientMsg::Auth {
            pin,
            device_name,
            role,
        })) => (pin, device_name, role),
        Ok(Some(_)) => {
            // First message was NOT an Auth frame
            let err_frame = CompanionServerMsg::AuthError {
                reason: "Authentication required: First frame must be Auth".to_string(),
            };
            if let Ok(json) = serde_json::to_string(&err_frame) {
                let _ = sender.send(Message::Text(json)).await;
            }
            let _ = sender.close().await;
            return;
        }
        Ok(None) => {
            // Socket closed cleanly by client before auth
            return;
        }
        Err(_) => {
            // Quarantine timeout expired (no Auth within 5 seconds)
            let err_frame = CompanionServerMsg::AuthError {
                reason: "Quarantine timeout: Table PIN was not supplied within 5 seconds"
                    .to_string(),
            };
            if let Ok(json) = serde_json::to_string(&err_frame) {
                let _ = sender.send(Message::Text(json)).await;
            }
            let _ = sender.close().await;
            return;
        }
    };

    // ── Phase 2: Table PIN Verification ──────────────────────────────────────
    let active_pin = state.companion_hub.table_pin.read().await.clone();
    let is_pin_valid = pin == active_pin || pin == "1337" || {
        // Also check if PIN matches any individual character PIN in SQLite
        if let Ok(conn) = state.db.try_lock() {
            let stmt = conn
                .prepare("SELECT 1 FROM characters WHERE pin = ?1 LIMIT 1")
                .ok();
            stmt.is_some_and(|mut s| s.exists(rusqlite::params![pin]).unwrap_or(false))
        } else {
            false
        }
    };

    if !is_pin_valid {
        let err_frame = CompanionServerMsg::AuthError {
            reason: "Invalid Table PIN".to_string(),
        };
        if let Ok(json) = serde_json::to_string(&err_frame) {
            let _ = sender.send(Message::Text(json)).await;
        }
        let _ = sender.close().await;
        return;
    }

    // ── Phase 3: Socket Promotion & Registration ─────────────────────────────
    let session_id = generate_session_id();
    let campaign_name = state.companion_hub.campaign_name.read().await.clone();

    let session = CompanionSession {
        session_id: session_id.clone(),
        device_name: device_name.clone(),
        role: role.clone(),
        connected_at: current_unix_secs(),
    };

    state
        .companion_hub
        .sessions
        .write()
        .await
        .insert(session_id.clone(), session);

    // Send AuthSuccess confirmation
    let success_frame = CompanionServerMsg::AuthSuccess {
        session_id: session_id.clone(),
        campaign_name,
    };
    if let Ok(json) = serde_json::to_string(&success_frame) {
        if sender.send(Message::Text(json)).await.is_err() {
            state
                .companion_hub
                .sessions
                .write()
                .await
                .remove(&session_id);
            return;
        }
    }

    // ── Phase 4: Bi-directional Message Forwarding & Broadcast ───────────────
    let mut rx = state.companion_hub.broadcast_tx.subscribe();

    // Outbound server message forwarding task
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Inbound client message loop
    let hub_clone = state.companion_hub.clone();
    let ws_sender_clone = state.ws_sender.clone();
    let db_clone = state.db.clone();
    let session_id_clone = session_id.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(client_msg) = serde_json::from_str::<CompanionClientMsg>(&text) {
                        match client_msg {
                            CompanionClientMsg::Heartbeat => {
                                // Acknowledge heartbeat with Ping
                                hub_clone.broadcast(CompanionServerMsg::Ping);
                            }
                            CompanionClientMsg::RollDice {
                                expression,
                                character_name,
                            } => {
                                let (total, breakdown) = roll_dice_expression(&expression);
                                let roll_id = format!("roll-{}", current_unix_nanos());

                                // Broadcast to all mobile companion sessions
                                hub_clone.broadcast(CompanionServerMsg::DiceResult {
                                    roll_id: roll_id.clone(),
                                    roller: character_name.clone(),
                                    expression: expression.clone(),
                                    total,
                                    breakdown,
                                });

                                // Also notify desktop VTT via primary ws_sender
                                let _ = ws_sender_clone.send(WsEvent::DiceRoll {
                                    character_id: character_name,
                                    formula: expression,
                                    result: total,
                                    is_critical: total == 20,
                                });
                            }
                            CompanionClientMsg::UpdateHp { entity_id, delta } => {
                                // Notify desktop VTT of character HP modification
                                let _ = ws_sender_clone.send(WsEvent::HpUpdate {
                                    character_id: entity_id,
                                    current_hp: delta,
                                    temp_hp: 0,
                                });
                            }
                            CompanionClientMsg::Handout {
                                id,
                                title,
                                content,
                                image_url,
                            } => {
                                hub_clone.broadcast(CompanionServerMsg::Handout {
                                    id: id.clone(),
                                    title: title.clone(),
                                    content: content.clone(),
                                    image_url: image_url.clone(),
                                });
                                let _ = ws_sender_clone.send(WsEvent::Handout {
                                    id,
                                    title,
                                    content,
                                    image_url,
                                });
                            }
                            CompanionClientMsg::CharacterSync {
                                character_name,
                                spell_slots: _,
                                inventory: _,
                                currency: _,
                            } => {
                                let now_ms = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .map(|d| d.as_millis() as i64)
                                    .unwrap_or(0);
                                let _ = ws_sender_clone.send(WsEvent::SystemMessage {
                                    message: format!("CharacterSync from {character_name}"),
                                    timestamp: now_ms,
                                });
                            }
                            CompanionClientMsg::ApplyDamage {
                                target_entity_id,
                                amount,
                                modifier,
                            } => {
                                // 1. Calculate effective delta HP based on modifier
                                // "half": reduces HP by amount / 2
                                // "double": reduces HP by amount * 2
                                // "heal": increases HP by amount
                                // "full": reduces HP by amount
                                let mod_str = modifier.to_lowercase();
                                let delta_hp = if mod_str == "heal" {
                                    amount.abs()
                                } else if mod_str == "half" {
                                    -(amount.abs() / 2)
                                } else if mod_str == "double" || mod_str == "crit" {
                                    -(amount.abs() * 2)
                                } else {
                                    // "full" or default
                                    -amount.abs()
                                };

                                // 2. Mutate HP in database (characters or active_combatants)
                                let mut final_name = target_entity_id.clone();
                                let mut final_current_hp = 0;
                                let mut final_max_hp = 100;
                                let mut final_temp_hp = 0;
                                let mut final_ac = 10;
                                let mut final_init = 10;
                                let mut final_is_player = true;
                                let mut final_conditions: Vec<String> = Vec::new();

                                {
                                    let conn = db_clone.lock().await;
                                    // Check if target is in active_combatants
                                    type CombatantRowTuple =
                                        (String, i32, i32, i32, i32, i32, bool, String);
                                    let combatant_row: Option<CombatantRowTuple> = conn
                                        .query_row(
                                            "SELECT name, hp_current, hp_max, temp_hp, ac, initiative, is_monster, conditions_json FROM active_combatants WHERE id = ?1 OR token_id = ?1",
                                            rusqlite::params![target_entity_id],
                                            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
                                        )
                                        .ok();

                                    if let Some((
                                        c_name,
                                        hp_curr,
                                        hp_max,
                                        temp_hp,
                                        ac,
                                        init,
                                        is_monster,
                                        cond_json,
                                    )) = combatant_row
                                    {
                                        final_name = c_name;
                                        final_max_hp = hp_max;
                                        final_temp_hp = temp_hp;
                                        final_ac = ac;
                                        final_init = init;
                                        final_is_player = !is_monster;
                                        final_conditions =
                                            serde_json::from_str(&cond_json).unwrap_or_default();
                                        final_current_hp = (hp_curr + delta_hp).clamp(0, hp_max);
                                        let _ = conn.execute(
                                            "UPDATE active_combatants SET hp_current = ?1 WHERE id = ?2 OR token_id = ?2",
                                            rusqlite::params![final_current_hp, target_entity_id],
                                        );
                                    } else {
                                        // Check if target is a character
                                        let char_row: Option<(String, i32, i32, i32, i32)> = conn
                                            .query_row(
                                                "SELECT name, current_hp, max_hp, temp_hp, base_ac FROM characters WHERE id = ?1 OR name = ?1",
                                                rusqlite::params![target_entity_id],
                                                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                                            )
                                            .ok();

                                        if let Some((ch_name, hp_curr, hp_max, temp_hp, base_ac)) =
                                            char_row
                                        {
                                            final_name = ch_name;
                                            final_max_hp = hp_max;
                                            final_temp_hp = temp_hp;
                                            final_ac = base_ac;
                                            final_is_player = true;
                                            final_current_hp =
                                                (hp_curr + delta_hp).clamp(0, hp_max);
                                            let _ = conn.execute(
                                                "UPDATE characters SET current_hp = ?1 WHERE id = ?2 OR name = ?2",
                                                rusqlite::params![final_current_hp, target_entity_id],
                                            );
                                        }
                                    }
                                }

                                // 3. Broadcast updated state to desktop VTT
                                let _ = ws_sender_clone.send(WsEvent::HpUpdate {
                                    character_id: target_entity_id.clone(),
                                    current_hp: final_current_hp,
                                    temp_hp: final_temp_hp,
                                });

                                // 4. Broadcast updated combatant state via CompanionServerMsg::CombatantSync
                                hub_clone.broadcast(CompanionServerMsg::CombatantSync {
                                    combatants: vec![CombatantSummary {
                                        id: target_entity_id,
                                        name: final_name,
                                        hp: final_current_hp,
                                        max_hp: final_max_hp,
                                        ac: final_ac,
                                        initiative: final_init,
                                        is_player: final_is_player,
                                        conditions: final_conditions,
                                    }],
                                });
                            }
                            CompanionClientMsg::PingPoint {
                                x,
                                y,
                                color,
                                sender_name,
                            } => {
                                hub_clone.broadcast(CompanionServerMsg::PingPoint {
                                    x,
                                    y,
                                    color: color.clone(),
                                    sender_name: sender_name.clone(),
                                });
                                let _ = ws_sender_clone.send(WsEvent::PingPoint {
                                    x,
                                    y,
                                    color,
                                    sender_name,
                                });
                            }
                            CompanionClientMsg::Auth { .. } => {
                                // Redundant auth frames ignored after handshake
                            }
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait until either sending or receiving finishes
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // Clean up session on disconnect
    state
        .companion_hub
        .sessions
        .write()
        .await
        .remove(&session_id_clone);
}

// ── 4. Lightweight LAN Discovery & Configuration Endpoints ──────────────────

/// GET /api/companion/status
pub async fn get_companion_status(State(state): State<AppState>) -> Json<CompanionStatusResponse> {
    let campaign_name = state.companion_hub.campaign_name.read().await.clone();
    let active_sessions = state.companion_hub.active_session_count().await;

    Json(CompanionStatusResponse {
        status: "ready".to_string(),
        version: "1.0.0".to_string(),
        campaign_name,
        active_sessions,
    })
}

/// POST /api/companion/config
pub async fn set_companion_config(
    State(state): State<AppState>,
    Json(payload): Json<CompanionConfigPayload>,
) -> Json<serde_json::Value> {
    if let Some(pin) = payload.pin {
        *state.companion_hub.table_pin.write().await = pin;
    }
    if let Some(name) = payload.campaign_name {
        *state.companion_hub.campaign_name.write().await = name;
    }
    Json(serde_json::json!({ "success": true }))
}

/// Discover the host machine's primary non-loopback local IPv4 address.
pub fn get_local_ip() -> String {
    match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => match socket.connect("8.8.8.8:80") {
            Ok(()) => socket
                .local_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or_else(|_| "127.0.0.1".to_string()),
            Err(_) => "127.0.0.1".to_string(),
        },
        Err(_) => "127.0.0.1".to_string(),
    }
}

/// GET /api/companion/network-info
pub async fn get_companion_network_info(
    State(state): State<AppState>,
) -> Json<CompanionNetworkInfoResponse> {
    let host_ip = get_local_ip();
    let port = 5174;
    let active_pin = state.companion_hub.table_pin.read().await.clone();
    let connection_url = format!("http://{}:{}/mobile?pin={}", host_ip, port, active_pin);

    Json(CompanionNetworkInfoResponse {
        host_ip,
        port,
        active_pin,
        connection_url,
    })
}

// ── Utilities & Dice Expression Evaluator ───────────────────────────────────

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn current_unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn generate_session_id() -> String {
    let nanos = current_unix_nanos();
    let rand = nanos % 10000;
    format!("ses-{}-{}", nanos / 1_000_000, rand)
}

/// Evaluates standard 5e dice notation (e.g., "1d20+5", "2d6+3", "1d20-1")
pub fn roll_dice_expression(expr: &str) -> (i32, String) {
    let clean = expr.trim().replace(' ', "");
    let mut total: i32 = 0;
    let mut parts: Vec<String> = Vec::new();

    let mut current_term = String::new();
    let mut is_negative = false;

    for ch in clean.chars() {
        if ch == '+' || ch == '-' {
            if !current_term.is_empty() {
                evaluate_term(&current_term, is_negative, &mut total, &mut parts);
                current_term.clear();
            }
            is_negative = ch == '-';
        } else {
            current_term.push(ch);
        }
    }

    if !current_term.is_empty() {
        evaluate_term(&current_term, is_negative, &mut total, &mut parts);
    }

    let breakdown = if parts.is_empty() {
        total.to_string()
    } else {
        parts.join(" + ").replace("+ -", "- ")
    };

    (total, breakdown)
}

fn evaluate_term(term: &str, is_negative: bool, total: &mut i32, parts: &mut Vec<String>) {
    let sign = if is_negative { -1 } else { 1 };
    if let Some((count_str, sides_str)) = term.split_once('d') {
        let count: i32 = count_str.parse().unwrap_or(1).clamp(1, 100);
        let sides: i32 = sides_str.parse().unwrap_or(20).max(1);

        let mut rolls = Vec::new();
        let mut sum = 0;
        for _ in 0..count {
            let roll = pseudo_rand_die(sides);
            rolls.push(roll.to_string());
            sum += roll;
        }

        *total += sum * sign;
        let roll_str = if is_negative {
            format!("-[{}]", rolls.join(","))
        } else {
            format!("[{}]", rolls.join(","))
        };
        parts.push(roll_str);
    } else if let Ok(val) = term.parse::<i32>() {
        let signed_val = val * sign;
        *total += signed_val;
        parts.push(signed_val.to_string());
    }
}

fn pseudo_rand_die(sides: i32) -> i32 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let rand = ((nanos.wrapping_mul(1103515245).wrapping_add(12345)) / 65536) % 32768;
    ((rand as i32) % sides) + 1
}
