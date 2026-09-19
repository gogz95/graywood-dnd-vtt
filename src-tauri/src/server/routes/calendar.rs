use crate::server::error::ServerError;
use crate::server::state::AppState;
use crate::systems::calendar::{advance_campaign_days, convert_epoch_to_calendars, CampaignAdvanceResult, MultiCalendarDate};
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AdvanceDaysRequest {
    pub days: u32,
}

#[derive(Debug, Serialize)]
pub struct CalendarResponse {
    pub success: bool,
    pub calendars: MultiCalendarDate,
}

#[derive(Debug, Serialize)]
pub struct AdvanceResponse {
    pub success: bool,
    pub result: CampaignAdvanceResult,
}

/// GET /api/campaign/calendar
/// Retrieves the current campaign date converted into all three canonical calendars:
/// Chancellery Standard, Ay Modlahd Solar Regnal, and Rucean Tide Cycle.
pub async fn get_current_calendar(
    State(state): State<AppState>,
) -> Result<Json<CalendarResponse>, ServerError> {
    let conn = state.db.lock().await;

    let epoch_days: u64 = conn
        .query_row(
            "SELECT epoch_days FROM campaign_state WHERE id = 'global'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let calendars = convert_epoch_to_calendars(epoch_days);

    Ok(Json(CalendarResponse {
        success: true,
        calendars,
    }))
}

/// POST /api/campaign/advance
/// Advances campaign time by `days`, updating the timekeeper, spoiling perishable reagents,
/// expiring stale notice-board bounty contracts, and broadcasting `DATE_ADVANCED` over WebSockets.
pub async fn advance_time(
    State(state): State<AppState>,
    Json(payload): Json<AdvanceDaysRequest>,
) -> Result<Json<AdvanceResponse>, ServerError> {
    let conn = state.db.lock().await;

    let result = advance_campaign_days(&conn, Some(&state.ws_sender), payload.days)
        .map_err(|e| ServerError::BadRequest(e.to_string()))?;

    Ok(Json(AdvanceResponse {
        success: true,
        result,
    }))
}
