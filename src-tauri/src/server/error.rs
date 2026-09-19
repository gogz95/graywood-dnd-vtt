use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServerError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Invalid 4-digit PIN provided")]
    InvalidPin,

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Internal server error: {0}")]
    Internal(String),
}

impl IntoResponse for ServerError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            ServerError::InvalidPin => (StatusCode::UNAUTHORIZED, self.to_string()),
            ServerError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
            ServerError::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ServerError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ServerError::Serialization(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ServerError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ServerError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "success": false,
            "error": error_message
        }));

        (status, body).into_response()
    }
}
