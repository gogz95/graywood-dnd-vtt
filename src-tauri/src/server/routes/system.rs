// src-tauri/src/server/routes/system.rs
// Local network discovery and connection info endpoint for mobile pairing.

use crate::server::state::AppState;
use axum::{extract::State, Json};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ConnectionInfoResponse {
    pub lan_ip: String,
    pub port: u16,
    pub join_url: String,
}

/// Detects non-loopback local IPv4 address using native UDP socket probing.
pub fn get_local_lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if ip.is_loopback() {
        None
    } else {
        Some(ip.to_string())
    }
}

/// GET /api/system/connection-info
pub async fn get_connection_info(State(_state): State<AppState>) -> Json<ConnectionInfoResponse> {
    let lan_ip = get_local_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    // Read the active port from the temporary file recorded on server startup,
    // defaulting to 4242 if not found.
    let port = std::env::temp_dir()
        .join("graywood.port")
        .as_path()
        .exists()
        .then(|| {
            std::fs::read_to_string(std::env::temp_dir().join("graywood.port"))
                .ok()?
                .trim()
                .parse::<u16>()
                .ok()
        })
        .flatten()
        .unwrap_or(4242);

    let join_url = format!("http://{}:{}", lan_ip, port);

    Json(ConnectionInfoResponse {
        lan_ip,
        port,
        join_url,
    })
}
