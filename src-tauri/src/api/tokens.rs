use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::server::state::AppState;

pub fn generate_uuid_v4() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let mut hasher = Sha256::new();
    hasher.update(now.to_le_bytes());
    hasher.update(count.to_le_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hasher.finalize()[..16]);

    // Set version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant 1 (RFC 4122)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompendiumEntity {
    pub id: String,
    pub name: String,
    pub category: String,
    pub source_pack: String,
    pub is_custom: bool,
    pub data_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneToken {
    pub instance_id: String,
    pub scene_id: String,
    pub entity_id: Option<String>,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub elevation: f32,
    pub size_cells: i32,
    pub system_data_json: String,
}

#[derive(Debug, Deserialize)]
pub struct SpawnTokenRequest {
    pub entity_id: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTokenRequest {
    pub name: Option<String>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub elevation: Option<f32>,
    pub size_cells: Option<i32>,
    pub system_data_json: Option<String>,
}

/// POST /api/scenes/{scene_id}/tokens/spawn
/// Instantiates an independent, mutable clone of a compendium template on a scene.
pub async fn spawn_scene_token(
    State(state): State<AppState>,
    AxumPath(scene_id): AxumPath<String>,
    Json(payload): Json<SpawnTokenRequest>,
) -> Result<Json<SceneToken>, (StatusCode, String)> {
    let conn = state.db.lock().await;

    // 1. Fetch base entity from compendium_entities where id = entity_id
    let mut stmt = conn
        .prepare(
            "SELECT id, name, category, source_pack, is_custom, data_json, created_at 
             FROM compendium_entities WHERE id = ?1",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let base_entity: CompendiumEntity = stmt
        .query_row([&payload.entity_id], |row| {
            let is_custom_int: i32 = row.get(4)?;
            Ok(CompendiumEntity {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                source_pack: row.get(3)?,
                is_custom: is_custom_int != 0,
                data_json: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => (
                StatusCode::NOT_FOUND,
                format!("Compendium entity '{}' not found", payload.entity_id),
            ),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    // 2. Count existing tokens in scene_tokens matching entity name on this scene_id to generate sequential numbering
    let pattern = format!("{} %", base_entity.name);
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scene_tokens 
             WHERE scene_id = ?1 AND (entity_id = ?2 OR name = ?3 OR name LIKE ?4)",
            rusqlite::params![scene_id, payload.entity_id, base_entity.name, pattern],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let next_num = count + 1;
    let token_name = format!("{} {}", base_entity.name, next_num);

    // 3. Generate a new instance_id (UUID v4)
    let instance_id = generate_uuid_v4();

    // 4. Copy data_json from base entity into system_data_json for the new token row
    let system_data_json = base_entity.data_json.clone();

    // 5. Insert into scene_tokens
    conn.execute(
        "INSERT INTO scene_tokens (instance_id, scene_id, entity_id, name, x, y, elevation, size_cells, system_data_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0.0, 1, ?7)",
        rusqlite::params![
            instance_id,
            scene_id,
            base_entity.id,
            token_name,
            payload.x,
            payload.y,
            system_data_json,
        ],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed inserting scene token: {}", e)))?;

    Ok(Json(SceneToken {
        instance_id,
        scene_id,
        entity_id: Some(base_entity.id),
        name: token_name,
        x: payload.x,
        y: payload.y,
        elevation: 0.0,
        size_cells: 1,
        system_data_json,
    }))
}

/// GET /api/scenes/{scene_id}/tokens
pub async fn list_scene_tokens(
    State(state): State<AppState>,
    AxumPath(scene_id): AxumPath<String>,
) -> Result<Json<Vec<SceneToken>>, (StatusCode, String)> {
    let conn = state.db.lock().await;

    let mut stmt = conn
        .prepare(
            "SELECT instance_id, scene_id, entity_id, name, x, y, elevation, size_cells, system_data_json
             FROM scene_tokens WHERE scene_id = ?1 ORDER BY rowid ASC",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tokens = stmt
        .query_map([&scene_id], |row| {
            Ok(SceneToken {
                instance_id: row.get(0)?,
                scene_id: row.get(1)?,
                entity_id: row.get(2)?,
                name: row.get(3)?,
                x: row.get(4)?,
                y: row.get(5)?,
                elevation: row.get(6)?,
                size_cells: row.get(7)?,
                system_data_json: row.get(8)?,
            })
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(tokens))
}

/// GET /api/scenes/{scene_id}/tokens/{instance_id}
pub async fn get_scene_token(
    State(state): State<AppState>,
    AxumPath((scene_id, instance_id)): AxumPath<(String, String)>,
) -> Result<Json<SceneToken>, (StatusCode, String)> {
    let conn = state.db.lock().await;

    let mut stmt = conn
        .prepare(
            "SELECT instance_id, scene_id, entity_id, name, x, y, elevation, size_cells, system_data_json
             FROM scene_tokens WHERE scene_id = ?1 AND instance_id = ?2",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let token = stmt
        .query_row(rusqlite::params![scene_id, instance_id], |row| {
            Ok(SceneToken {
                instance_id: row.get(0)?,
                scene_id: row.get(1)?,
                entity_id: row.get(2)?,
                name: row.get(3)?,
                x: row.get(4)?,
                y: row.get(5)?,
                elevation: row.get(6)?,
                size_cells: row.get(7)?,
                system_data_json: row.get(8)?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                (StatusCode::NOT_FOUND, "Token not found".to_string())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    Ok(Json(token))
}

/// PATCH /api/scenes/{scene_id}/tokens/{instance_id}
/// Mutates an active scene token instance without altering the compendium entity template.
pub async fn update_scene_token(
    State(state): State<AppState>,
    AxumPath((scene_id, instance_id)): AxumPath<(String, String)>,
    Json(payload): Json<UpdateTokenRequest>,
) -> Result<Json<SceneToken>, (StatusCode, String)> {
    let conn = state.db.lock().await;

    // Fetch existing
    let mut stmt = conn
        .prepare(
            "SELECT instance_id, scene_id, entity_id, name, x, y, elevation, size_cells, system_data_json
             FROM scene_tokens WHERE scene_id = ?1 AND instance_id = ?2",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut current = stmt
        .query_row(rusqlite::params![scene_id, instance_id], |row| {
            Ok(SceneToken {
                instance_id: row.get(0)?,
                scene_id: row.get(1)?,
                entity_id: row.get(2)?,
                name: row.get(3)?,
                x: row.get(4)?,
                y: row.get(5)?,
                elevation: row.get(6)?,
                size_cells: row.get(7)?,
                system_data_json: row.get(8)?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                (StatusCode::NOT_FOUND, "Token not found".to_string())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    if let Some(n) = payload.name {
        current.name = n;
    }
    if let Some(x) = payload.x {
        current.x = x;
    }
    if let Some(y) = payload.y {
        current.y = y;
    }
    if let Some(elev) = payload.elevation {
        current.elevation = elev;
    }
    if let Some(size) = payload.size_cells {
        current.size_cells = size;
    }
    if let Some(sys_data) = payload.system_data_json {
        current.system_data_json = sys_data;
    }

    conn.execute(
        "UPDATE scene_tokens SET name = ?1, x = ?2, y = ?3, elevation = ?4, size_cells = ?5, system_data_json = ?6
         WHERE scene_id = ?7 AND instance_id = ?8",
        rusqlite::params![
            current.name,
            current.x,
            current.y,
            current.elevation,
            current.size_cells,
            current.system_data_json,
            scene_id,
            instance_id,
        ],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed updating scene token: {}", e)))?;

    Ok(Json(current))
}

// ── Lease handler ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LeaseRequest {
    pub user_id: String,
}

#[derive(Debug, Serialize)]
pub struct LeaseResponse {
    pub acquired: bool,
    pub holder: Option<String>,
}

/// POST /api/scenes/{scene_id}/tokens/{instance_id}/lease
/// Grants or renews an exclusive drag lease for `user_id`.
/// Returns 200 OK on success or 409 Conflict when another user holds the lease.
pub async fn request_token_lease(
    State(state): State<AppState>,
    AxumPath((_scene_id, instance_id)): AxumPath<(String, String)>,
    Json(body): Json<LeaseRequest>,
) -> Result<Json<LeaseResponse>, (StatusCode, String)> {
    let acquired =
        crate::state::lease::acquire_lease(&state.lease_map, &instance_id, &body.user_id).await;

    if acquired {
        Ok(Json(LeaseResponse {
            acquired: true,
            holder: Some(body.user_id),
        }))
    } else {
        let holder = crate::state::lease::current_holder(&state.lease_map, &instance_id).await;
        Err((
            StatusCode::CONFLICT,
            serde_json::to_string(&LeaseResponse {
                acquired: false,
                holder,
            })
            .unwrap_or_default(),
        ))
    }
}
