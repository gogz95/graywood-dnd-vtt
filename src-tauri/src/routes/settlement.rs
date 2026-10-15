use crate::models::settlement::{SettlementContract, SettlementProfile};
use crate::server::error::ServerError;
use crate::server::state::AppState;
use axum::{extract::State, Json};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct OstravaProfileResponse {
    pub success: bool,
    pub profile: Option<SettlementProfile>,
    pub contracts: Vec<SettlementContract>,
}

/// GET /api/settlements/ostrava
/// Returns the full gazetteer settlement profile for the trade port of Ostrava,
/// including demographics, precursor under-ruins hooks, 10% currency assay enforcement,
/// weapon peace-bonding laws, and the 5 level-4 notice board contracts.
pub async fn get_ostrava_profile(
    State(state): State<AppState>,
) -> Result<Json<OstravaProfileResponse>, ServerError> {
    let conn = state.db.lock().await;

    let profile = SettlementProfile::get_ostrava(&conn)?;
    let contracts = SettlementContract::list_for_settlement(&conn, "settlement_ostrava")?;

    Ok(Json(OstravaProfileResponse {
        success: true,
        profile,
        contracts,
    }))
}
