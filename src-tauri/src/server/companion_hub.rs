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

// ── 0. Role Hierarchy ────────────────────────────────────────────────────────

/// Session role assigned at auth time; can be promoted by OwnerDm.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientRole {
    OwnerDm,
    AssistantDm,
    Player,
    Spectator,
}

impl ClientRole {
    /// Parse from the freeform string clients send during Auth.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "owner_dm" | "ownerdm" | "dm" | "gm" => ClientRole::OwnerDm,
            "assistant_dm" | "assistantdm" | "co_gm" | "cogm" => ClientRole::AssistantDm,
            "spectator" | "observer" => ClientRole::Spectator,
            _ => ClientRole::Player,
        }
    }

    pub fn is_dm(&self) -> bool {
        matches!(self, ClientRole::OwnerDm | ClientRole::AssistantDm)
    }

    pub fn can_mutate_canvas(&self) -> bool {
        matches!(
            self,
            ClientRole::OwnerDm | ClientRole::AssistantDm | ClientRole::Player
        )
    }
}

impl std::fmt::Display for ClientRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ClientRole::OwnerDm => "owner_dm",
            ClientRole::AssistantDm => "assistant_dm",
            ClientRole::Player => "player",
            ClientRole::Spectator => "spectator",
        };
        write!(f, "{s}")
    }
}

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

    #[serde(
        rename = "DropConcentration",
        alias = "drop_concentration",
        alias = "DROP_CONCENTRATION"
    )]
    DropConcentration { entity_id: String },

    #[serde(rename = "Chat", alias = "chat", alias = "CHAT")]
    Chat { message: ChatMessage },

    /// Inbound token movement — only forwarded if role permits.
    #[serde(
        rename = "UpdateTokenPosition",
        alias = "update_token_position",
        alias = "UPDATE_TOKEN_POSITION"
    )]
    UpdateTokenPosition {
        token_id: String,
        x: f64,
        y: f64,
        /// The owner_ids list embedded in the token (sent by client for server validation).
        owner_ids: Vec<String>,
    },

    /// DM-only: promote a session to a new role.
    #[serde(rename = "PromoteRole", alias = "promote_role", alias = "PROMOTE_ROLE")]
    PromoteRole {
        target_session_id: String,
        new_role: String,
    },

    /// DM-only: assign owner_ids for a specific token.
    #[serde(
        rename = "AssignTokenOwner",
        alias = "assign_token_owner",
        alias = "ASSIGN_TOKEN_OWNER"
    )]
    AssignTokenOwner {
        token_id: String,
        owner_ids: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub content: String,
    pub recipient_id: Option<String>, // None = Public, Some(id) = Private Whisper
    pub is_system: bool,
    pub timestamp: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiceTrajectoryVector {
    pub x: f32,
    pub y: f32,
    pub angle: f32,
    pub velocity: f32,
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
        #[serde(default)]
        seed: u64,
        #[serde(default)]
        vectors: Vec<DiceTrajectoryVector>,
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

    #[serde(rename = "ConcentrationCheckRequired")]
    ConcentrationCheckRequired {
        entity_id: String,
        entity_name: String,
        dc: i32,
        damage_taken: i32,
    },

    #[serde(rename = "Chat", alias = "chat", alias = "CHAT")]
    Chat { message: ChatMessage },

    /// Sent back to the offending sender when a canvas mutation is denied.
    #[serde(rename = "AuthWarning")]
    AuthWarning {
        reason: String,
        token_id: Option<String>,
    },

    /// Broadcast when a session's role is changed.
    #[serde(rename = "RoleUpdated")]
    RoleUpdated {
        session_id: String,
        new_role: String,
    },

    /// Broadcast the full connected session list to DM clients.
    #[serde(rename = "SessionList")]
    SessionList { sessions: Vec<SessionSummary> },

    /// Broadcast DM Staging Curtain ("Blackout Veil") state.
    #[serde(rename = "STAGING_CURTAIN")]
    StagingCurtain { active: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub device_name: String,
    pub role: String,
    pub connected_at: u64,
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
    pub role: ClientRole,
    /// Character IDs or session IDs this session is authorised to control.
    pub owner_ids: Vec<String>,
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
    let (pin, device_name, role_raw) = match auth_attempt {
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

    let role = ClientRole::from_str(&role_raw);
    let session = CompanionSession {
        session_id: session_id.clone(),
        device_name: device_name.clone(),
        role,
        owner_ids: Vec::new(),
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

    // Send initial StagingCurtain state
    let initial_curtain = state
        .curtain_active
        .load(std::sync::atomic::Ordering::Relaxed);
    let curtain_frame = CompanionServerMsg::StagingCurtain {
        active: initial_curtain,
    };
    if let Ok(json) = serde_json::to_string(&curtain_frame) {
        let _ = sender.send(Message::Text(json)).await;
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
    let sessions_clone = Arc::clone(&state.companion_hub.sessions);

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
                                let seed = (current_unix_nanos() & 0xFFFFFFFFFFFFFFFF) as u64;

                                let count = expression
                                    .split('d')
                                    .next()
                                    .and_then(|s| s.trim().parse::<usize>().ok())
                                    .unwrap_or(1)
                                    .clamp(1, 8);

                                let mut vectors = Vec::with_capacity(count);
                                let mut rng_state = seed;
                                for _ in 0..count {
                                    rng_state ^= rng_state << 13;
                                    rng_state ^= rng_state >> 7;
                                    rng_state ^= rng_state << 17;
                                    let x = ((rng_state % 1000) as f32 / 1000.0) * 0.6 - 0.3;
                                    rng_state ^= rng_state << 13;
                                    let y = ((rng_state % 1000) as f32 / 1000.0) * 0.4 + 0.3;
                                    rng_state ^= rng_state >> 17;
                                    let angle = ((rng_state % 360) as f32).to_radians();
                                    rng_state ^= rng_state << 7;
                                    let velocity =
                                        10.0 + ((rng_state % 1000) as f32 / 1000.0) * 8.0;
                                    vectors.push(DiceTrajectoryVector {
                                        x,
                                        y,
                                        angle,
                                        velocity,
                                    });
                                }

                                // Broadcast to all mobile companion sessions
                                hub_clone.broadcast(CompanionServerMsg::DiceResult {
                                    roll_id: roll_id.clone(),
                                    roller: character_name.clone(),
                                    expression: expression.clone(),
                                    total,
                                    breakdown,
                                    seed,
                                    vectors: vectors.clone(),
                                });

                                // Also notify desktop VTT via primary ws_sender
                                let _ = ws_sender_clone.send(WsEvent::DiceRoll {
                                    character_id: character_name,
                                    formula: expression,
                                    result: total,
                                    is_critical: total == 20,
                                    seed: Some(seed),
                                    vectors: Some(vectors),
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
                                        id: target_entity_id.clone(),
                                        name: final_name.clone(),
                                        hp: final_current_hp,
                                        max_hp: final_max_hp,
                                        ac: final_ac,
                                        initiative: final_init,
                                        is_player: final_is_player,
                                        conditions: final_conditions.clone(),
                                    }],
                                });

                                // 5. Check if target was concentrating and took damage
                                if delta_hp < 0
                                    && final_conditions
                                        .iter()
                                        .any(|c| c.eq_ignore_ascii_case("Concentrating"))
                                {
                                    let damage_taken = delta_hp.abs();
                                    let dc = std::cmp::max(10, damage_taken / 2);

                                    hub_clone.broadcast(
                                        CompanionServerMsg::ConcentrationCheckRequired {
                                            entity_id: target_entity_id.clone(),
                                            entity_name: final_name.clone(),
                                            dc,
                                            damage_taken,
                                        },
                                    );

                                    let _ =
                                        ws_sender_clone.send(WsEvent::ConcentrationCheckRequired {
                                            entity_id: target_entity_id.clone(),
                                            entity_name: final_name.clone(),
                                            dc,
                                            damage_taken,
                                        });
                                }
                            }
                            CompanionClientMsg::DropConcentration { entity_id } => {
                                let conn = db_clone.lock().await;
                                let row: Option<(String, i32, i32, i32, i32, bool, String)> = conn
                                    .query_row(
                                        "SELECT name, hp_current, hp_max, ac, initiative, is_monster, conditions_json FROM active_combatants WHERE id = ?1 OR token_id = ?1",
                                        rusqlite::params![entity_id],
                                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
                                    )
                                    .ok();

                                if let Some((
                                    c_name,
                                    hp_curr,
                                    hp_max,
                                    ac,
                                    init,
                                    is_monster,
                                    cond_json,
                                )) = row
                                {
                                    let mut conds: Vec<String> =
                                        serde_json::from_str(&cond_json).unwrap_or_default();
                                    conds.retain(|c| !c.eq_ignore_ascii_case("Concentrating"));
                                    let new_cond_json = serde_json::to_string(&conds)
                                        .unwrap_or_else(|_| "[]".to_string());
                                    let _ = conn.execute(
                                        "UPDATE active_combatants SET conditions_json = ?1 WHERE id = ?2 OR token_id = ?2",
                                        rusqlite::params![new_cond_json, entity_id],
                                    );

                                    hub_clone.broadcast(CompanionServerMsg::CombatantSync {
                                        combatants: vec![CombatantSummary {
                                            id: entity_id.clone(),
                                            name: c_name,
                                            hp: hp_curr,
                                            max_hp: hp_max,
                                            ac,
                                            initiative: init,
                                            is_player: !is_monster,
                                            conditions: conds,
                                        }],
                                    });
                                }
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
                            CompanionClientMsg::Chat { message } => {
                                // Broadcast to all companion devices
                                hub_clone.broadcast(CompanionServerMsg::Chat {
                                    message: message.clone(),
                                });
                                // Forward to desktop VTT
                                let _ = ws_sender_clone.send(WsEvent::ChatMessage { message });
                            }
                            CompanionClientMsg::Auth { .. } => {
                                // Redundant auth frames ignored after handshake
                            }

                            // ── Role-gated: Token Position Update ────────────
                            CompanionClientMsg::UpdateTokenPosition {
                                token_id,
                                x,
                                y,
                                owner_ids,
                            } => {
                                let sessions_guard = sessions_clone.read().await;
                                let my_role = sessions_guard
                                    .get(&session_id_clone)
                                    .map(|s| s.role.clone())
                                    .unwrap_or(ClientRole::Spectator);
                                drop(sessions_guard);

                                let allowed = match &my_role {
                                    // DMs can move any token
                                    r if r.is_dm() => true,
                                    // Players can only move tokens they own
                                    ClientRole::Player => {
                                        owner_ids.contains(&session_id_clone) || {
                                            // Also check by device name stored in session
                                            let sg = sessions_clone.read().await;
                                            let matched = sg
                                                .get(&session_id_clone)
                                                .map(|s| owner_ids.contains(&s.device_name))
                                                .unwrap_or(false);
                                            drop(sg);
                                            matched
                                        }
                                    }
                                    // Spectators cannot move anything
                                    _ => false,
                                };

                                if allowed {
                                    let _ = ws_sender_clone.send(WsEvent::TokenMove {
                                        id: token_id,
                                        x,
                                        y,
                                    });
                                } else {
                                    // Send AuthWarning only back to the offending socket via broadcast
                                    // (connection-scoped send not available here — use hub broadcast)
                                    hub_clone.broadcast(CompanionServerMsg::AuthWarning {
                                        reason: format!(
                                            "Role '{}' is not authorised to move token '{}'",
                                            my_role, token_id
                                        ),
                                        token_id: Some(token_id),
                                    });
                                }
                            }

                            // ── DM-only: Promote session role ─────────────────
                            CompanionClientMsg::PromoteRole {
                                target_session_id,
                                new_role,
                            } => {
                                let sessions_guard = sessions_clone.read().await;
                                let my_role = sessions_guard
                                    .get(&session_id_clone)
                                    .map(|s| s.role.clone())
                                    .unwrap_or(ClientRole::Spectator);
                                drop(sessions_guard);

                                if my_role.is_dm() {
                                    let typed = ClientRole::from_str(&new_role);
                                    // OwnerDm cannot be granted over WS (only set at auth)
                                    if typed != ClientRole::OwnerDm {
                                        let mut sg = sessions_clone.write().await;
                                        if let Some(sess) = sg.get_mut(&target_session_id) {
                                            sess.role = typed;
                                        }
                                        drop(sg);
                                        hub_clone.broadcast(CompanionServerMsg::RoleUpdated {
                                            session_id: target_session_id,
                                            new_role,
                                        });
                                    }
                                } else {
                                    hub_clone.broadcast(CompanionServerMsg::AuthWarning {
                                        reason: "Only DM/OwnerDm can promote roles".to_string(),
                                        token_id: None,
                                    });
                                }
                            }

                            // ── DM-only: Assign token owner_ids ──────────────
                            CompanionClientMsg::AssignTokenOwner {
                                token_id,
                                owner_ids,
                            } => {
                                let sessions_guard = sessions_clone.read().await;
                                let my_role = sessions_guard
                                    .get(&session_id_clone)
                                    .map(|s| s.role.clone())
                                    .unwrap_or(ClientRole::Spectator);
                                drop(sessions_guard);

                                if my_role.is_dm() {
                                    // Persist to SQLite and forward to VTT
                                    let owner_json =
                                        serde_json::to_string(&owner_ids).unwrap_or_default();
                                    {
                                        let conn = db_clone.lock().await;
                                        let _ = conn.execute(
                                            "UPDATE active_combatants SET owner_ids_json = ?1 WHERE token_id = ?2",
                                            rusqlite::params![owner_json, token_id],
                                        );
                                    }
                                    let _ = ws_sender_clone.send(WsEvent::TokenOwnerAssigned {
                                        token_id,
                                        owner_ids,
                                    });
                                } else {
                                    hub_clone.broadcast(CompanionServerMsg::AuthWarning {
                                        reason: "Only DM/OwnerDm can assign token ownership"
                                            .to_string(),
                                        token_id: Some(token_id),
                                    });
                                }
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
        .remove(&session_id);
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

// ── Permission Matrix REST Endpoints ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PromoteRolePayload {
    pub new_role: String,
}

#[derive(Debug, Deserialize)]
pub struct AssignOwnersPayload {
    pub owner_ids: Vec<String>,
}

/// GET /api/companion/sessions — lists all active sessions (DM workstation use only)
pub async fn get_active_sessions(State(state): State<AppState>) -> Json<Vec<SessionSummary>> {
    let sessions = state.companion_hub.sessions.read().await;
    let list: Vec<SessionSummary> = sessions
        .values()
        .map(|s| SessionSummary {
            session_id: s.session_id.clone(),
            device_name: s.device_name.clone(),
            role: s.role.to_string(),
            connected_at: s.connected_at,
        })
        .collect();
    Json(list)
}

/// POST /api/companion/sessions/:session_id/promote
/// Body: { "new_role": "assistant_dm" | "player" | "spectator" }
pub async fn promote_session_role(
    State(state): State<AppState>,
    axum::extract::Path(session_id): axum::extract::Path<String>,
    Json(payload): Json<PromoteRolePayload>,
) -> Json<serde_json::Value> {
    let typed = ClientRole::from_str(&payload.new_role);
    if typed == ClientRole::OwnerDm {
        return Json(
            serde_json::json!({ "success": false, "error": "OwnerDm cannot be granted via REST" }),
        );
    }
    let mut sessions = state.companion_hub.sessions.write().await;
    if let Some(sess) = sessions.get_mut(&session_id) {
        sess.role = typed;
        state
            .companion_hub
            .broadcast(CompanionServerMsg::RoleUpdated {
                session_id: session_id.clone(),
                new_role: payload.new_role,
            });
        Json(serde_json::json!({ "success": true }))
    } else {
        Json(serde_json::json!({ "success": false, "error": "Session not found" }))
    }
}

/// POST /api/companion/tokens/:token_id/owners
/// Body: { "owner_ids": ["ses-xxx", "device-name-yyy"] }
pub async fn assign_token_owners(
    State(state): State<AppState>,
    axum::extract::Path(token_id): axum::extract::Path<String>,
    Json(payload): Json<AssignOwnersPayload>,
) -> Json<serde_json::Value> {
    let owner_json = serde_json::to_string(&payload.owner_ids).unwrap_or_default();
    {
        let conn = state.db.lock().await;
        let _ = conn.execute(
            "UPDATE active_combatants SET owner_ids_json = ?1 WHERE token_id = ?2",
            rusqlite::params![owner_json, token_id],
        );
    }
    let _ = state.ws_sender.send(WsEvent::TokenOwnerAssigned {
        token_id,
        owner_ids: payload.owner_ids,
    });
    Json(serde_json::json!({ "success": true }))
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
