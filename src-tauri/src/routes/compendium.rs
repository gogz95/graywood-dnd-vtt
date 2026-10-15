use crate::models::{CompendiumClass, CompendiumSpell, PublicCharacterRoster};
use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SpellFilterQuery {
    pub level: Option<i32>,
    pub class: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompendiumClassesResponse {
    pub success: bool,
    pub count: usize,
    pub classes: Vec<CompendiumClass>,
}

#[derive(Debug, Serialize)]
pub struct CompendiumSpellsResponse {
    pub success: bool,
    pub count: usize,
    pub spells: Vec<CompendiumSpell>,
}

#[derive(Debug, Serialize)]
pub struct PublicRosterResponse {
    pub success: bool,
    pub count: usize,
    pub characters: Vec<PublicCharacterRoster>,
}

/// GET /api/compendium/classes
/// Returns complete 5e core class entries from SQLite.
pub async fn get_classes(
    State(state): State<AppState>,
) -> Result<Json<CompendiumClassesResponse>, ServerError> {
    let conn = state.db.lock().await;
    let classes = CompendiumClass::list_all(&conn)?;
    let count = classes.len();

    Ok(Json(CompendiumClassesResponse {
        success: true,
        count,
        classes,
    }))
}

/// GET /api/compendium/spells?level=&class=
/// Returns full spell cards filtered by optional level and class parameters.
pub async fn get_spells(
    Query(filters): Query<SpellFilterQuery>,
    State(state): State<AppState>,
) -> Result<Json<CompendiumSpellsResponse>, ServerError> {
    let conn = state.db.lock().await;
    let spells = CompendiumSpell::query_spells(&conn, filters.level, filters.class.as_deref())?;
    let count = spells.len();

    Ok(Json(CompendiumSpellsResponse {
        success: true,
        count,
        spells,
    }))
}

/// GET /api/characters/roster
/// Returns non-sensitive public roster info (id, name, is_orb_sealed).
/// Explicitly excludes PINs and sensitive character statistics from public query.
pub async fn get_public_roster(
    State(state): State<AppState>,
) -> Result<Json<PublicRosterResponse>, ServerError> {
    let conn = state.db.lock().await;
    let characters = PublicCharacterRoster::list_public_roster(&conn)?;
    let count = characters.len();

    Ok(Json(PublicRosterResponse {
        success: true,
        count,
        characters,
    }))
}
