use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct IngestLoreChunkPayload {
    pub chunk_index: i32,
    pub content_text: String,
    pub tags: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IngestLorePayload {
    pub document_title: String,
    pub chunks: Vec<IngestLoreChunkPayload>,
}

#[derive(Debug, Serialize)]
pub struct IngestLoreResponse {
    pub success: bool,
    pub count: usize,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct LoreSearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoreSearchResult {
    pub id: String,
    pub document_title: String,
    pub chunk_index: i32,
    pub content_text: String,
    pub tags: String,
    pub score: f32,
}

#[derive(Debug, Serialize)]
pub struct LoreSearchResponse {
    pub success: bool,
    pub count: usize,
    pub matches: Vec<LoreSearchResult>,
    pub fallback_used: bool,
}

/// POST /api/lore/ingest
pub async fn ingest_lore(
    State(state): State<AppState>,
    Json(payload): Json<IngestLorePayload>,
) -> (StatusCode, Json<IngestLoreResponse>) {
    let conn = state.db.lock().await;

    let doc_id = format!("doc-{}", uuid_or_timestamp());
    let mut inserted_count = 0;

    for chunk in payload.chunks {
        let chunk_id = format!("{}-chk-{}", doc_id, chunk.chunk_index);
        let tags = chunk.tags.unwrap_or_default();

        let _ = conn.execute(
            "INSERT INTO lore_documents (id, document_title, chunk_index, content_text, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&doc_id, &payload.document_title, chunk.chunk_index, &chunk.content_text, &tags],
        );

        let _ = conn.execute(
            "INSERT INTO lore_chunks (id, document_title, chunk_index, content_text, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&chunk_id, &payload.document_title, chunk.chunk_index, &chunk.content_text, &tags],
        );

        let _ = conn.execute(
            "INSERT INTO lore_fts (content_text, document_title) VALUES (?1, ?2)",
            rusqlite::params![&chunk.content_text, &payload.document_title],
        );

        inserted_count += 1;
    }

    (
        StatusCode::OK,
        Json(IngestLoreResponse {
            success: true,
            count: inserted_count,
            message: format!(
                "Successfully indexed {} lore chunks for '{}'",
                inserted_count, payload.document_title
            ),
        }),
    )
}

/// GET /api/lore/search?q=...
pub async fn search_lore(
    Query(query): Query<LoreSearchQuery>,
    State(state): State<AppState>,
) -> Result<Json<LoreSearchResponse>, ServerError> {
    let conn = state.db.lock().await;
    let raw_q = query.q.unwrap_or_default().trim().to_string();
    if raw_q.is_empty() {
        return Ok(Json(LoreSearchResponse {
            success: true,
            count: 0,
            matches: vec![],
            fallback_used: false,
        }));
    }

    let mut matches = Vec::new();
    let mut fallback_used = false;

    // 1. Try SQLite FTS5 MATCH query first
    let fts_query = format!("\"{}\"*", raw_q.replace('"', "\"\""));
    let fts_stmt = conn.prepare(
        "SELECT rowid, content_text, document_title FROM lore_fts WHERE lore_fts MATCH ?1 LIMIT 50",
    );

    if let Ok(mut stmt) = fts_stmt {
        let rows = stmt.query_map(rusqlite::params![&fts_query], |row| {
            let rowid: i64 = row.get(0)?;
            let content_text: String = row.get(1)?;
            let document_title: String = row.get(2)?;
            Ok(LoreSearchResult {
                id: format!("fts-{}", rowid),
                document_title,
                chunk_index: 0,
                content_text,
                tags: String::new(),
                score: 1.0,
            })
        });

        if let Ok(rows) = rows {
            for r in rows.flatten() {
                matches.push(r);
            }
        }
    }

    // 2. Seamless Fallback: If FTS returned 0 results or failed, use LIKE search on lore_chunks
    if matches.is_empty() {
        fallback_used = true;
        let like_pat = format!("%{}%", raw_q);
        let like_stmt = conn.prepare(
            "SELECT id, document_title, chunk_index, content_text, tags FROM lore_chunks WHERE content_text LIKE ?1 OR document_title LIKE ?1 LIMIT 50"
        );
        if let Ok(mut stmt) = like_stmt {
            let rows = stmt.query_map(rusqlite::params![&like_pat], |row| {
                Ok(LoreSearchResult {
                    id: row.get(0)?,
                    document_title: row.get(1)?,
                    chunk_index: row.get(2)?,
                    content_text: row.get(3)?,
                    tags: row.get(4)?,
                    score: 0.5,
                })
            });
            if let Ok(rows) = rows {
                for r in rows.flatten() {
                    matches.push(r);
                }
            }
        }
    }

    let count = matches.len();
    Ok(Json(LoreSearchResponse {
        success: true,
        count,
        matches,
        fallback_used,
    }))
}

// ── Categorized Entity Ingestion Endpoints ─────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct MonsterPayload {
    pub id: Option<String>,
    pub name: String,
    pub cr: Option<String>,
    pub size: Option<String>,
    pub type_str: Option<String>,
    pub ac: Option<i32>,
    pub hp: Option<i32>,
    pub stats_json: Option<String>,
    pub traits_json: Option<String>,
    pub actions_json: Option<String>,
    pub source: Option<String>,
}

pub async fn save_monster(
    State(state): State<AppState>,
    Json(payload): Json<MonsterPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    let conn = state.db.lock().await;
    let id = payload
        .id
        .unwrap_or_else(|| format!("mon-{}", uuid_or_timestamp()));
    let cr = payload.cr.unwrap_or_else(|| "1".to_string());
    let size = payload.size.unwrap_or_else(|| "Medium".to_string());
    let type_str = payload
        .type_str
        .unwrap_or_else(|| "Monstrosity".to_string());
    let ac = payload.ac.unwrap_or(10);
    let hp = payload.hp.unwrap_or(10);
    let stats_json = payload.stats_json.unwrap_or_else(|| "{}".to_string());
    let traits_json = payload.traits_json.unwrap_or_else(|| "[]".to_string());
    let actions_json = payload.actions_json.unwrap_or_else(|| "[]".to_string());
    let source = payload.source.unwrap_or_else(|| "Ingested".to_string());

    let res = conn.execute(
        "INSERT OR REPLACE INTO monsters (id, name, cr, size, type, ac, hp, stats_json, traits_json, actions_json, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![id, payload.name, cr, size, type_str, ac, hp, stats_json, traits_json, actions_json, source],
    );

    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "id": id })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct SpellPayload {
    pub id: Option<String>,
    pub name: String,
    pub level: Option<i32>,
    pub school: Option<String>,
    pub casting_time: Option<String>,
    pub range: Option<String>,
    pub duration: Option<String>,
    pub components: Option<String>,
    pub description_text: Option<String>,
    pub source: Option<String>,
}

pub async fn save_spell(
    State(state): State<AppState>,
    Json(payload): Json<SpellPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    let conn = state.db.lock().await;
    let id = payload
        .id
        .unwrap_or_else(|| format!("spl-{}", uuid_or_timestamp()));
    let level = payload.level.unwrap_or(0);
    let school = payload.school.unwrap_or_else(|| "Evocation".to_string());
    let casting_time = payload
        .casting_time
        .unwrap_or_else(|| "1 action".to_string());
    let range = payload.range.unwrap_or_else(|| "60 feet".to_string());
    let duration = payload
        .duration
        .unwrap_or_else(|| "Instantaneous".to_string());
    let components = payload.components.unwrap_or_else(|| "V, S".to_string());
    let description_text = payload.description_text.unwrap_or_default();
    let source = payload.source.unwrap_or_else(|| "Ingested".to_string());

    let res = conn.execute(
        "INSERT OR REPLACE INTO spells (id, name, level, school, casting_time, range, duration, components, description_text, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, payload.name, level, school, casting_time, range, duration, components, description_text, source],
    );

    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "id": id })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct ItemPayload {
    pub id: Option<String>,
    pub name: String,
    pub item_type: Option<String>,
    pub rarity: Option<String>,
    pub cost: Option<String>,
    pub weight: Option<f64>,
    pub description_text: Option<String>,
    pub source: Option<String>,
}

pub async fn save_item(
    State(state): State<AppState>,
    Json(payload): Json<ItemPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    let conn = state.db.lock().await;
    let id = payload
        .id
        .unwrap_or_else(|| format!("itm-{}", uuid_or_timestamp()));
    let item_type = payload
        .item_type
        .unwrap_or_else(|| "Adventuring Gear".to_string());
    let rarity = payload.rarity.unwrap_or_else(|| "Common".to_string());
    let cost = payload.cost.unwrap_or_else(|| "0 gp".to_string());
    let weight = payload.weight.unwrap_or(0.0);
    let description_text = payload.description_text.unwrap_or_default();
    let source = payload.source.unwrap_or_else(|| "Ingested".to_string());

    let res = conn.execute(
        "INSERT OR REPLACE INTO items (id, name, item_type, rarity, cost, weight, description_text, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, payload.name, item_type, rarity, cost, weight, description_text, source],
    );

    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "id": id })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        ),
    }
}

fn uuid_or_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}
