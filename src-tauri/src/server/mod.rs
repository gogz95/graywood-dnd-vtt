pub mod companion_hub;
pub mod error;
pub mod routes;
pub mod state;

pub use error::ServerError;
pub use routes::ws::WsEvent;
pub use state::AppState;

use axum::{
    extract::{DefaultBodyLimit, State},
    routing::{get, patch, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

pub const DEFAULT_SERVER_ADDR: &str = "0.0.0.0:5174";
pub const LAN_ASSET_SERVER_ADDR: &str = "0.0.0.0:8080";

/// Constructs the complete Axum Router with all endpoints, CORS, and WebSocket hub.
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // 1. Static Assets & PWA Delivery
        .route("/", get(routes::assets::serve_index))
        .route("/assets/*path", get(routes::assets::serve_assets))
        .route(
            "/api/assets/upload",
            post(upload_asset_handler).layer(DefaultBodyLimit::max(100 * 1024 * 1024)),
        )
        .route(
            "/api/proxy/llm",
            post(ollama_proxy_handler),
        )
        // 2. Compendium Query Endpoints
        .route(
            "/api/compendium/classes",
            get(routes::compendium::get_classes),
        )
        .route(
            "/api/compendium/spells",
            get(routes::compendium::get_spells),
        )
        .route(
            "/api/characters/roster",
            get(routes::compendium::get_public_roster),
        )
        // 3. PIN Authentication & Claim Protocol
        .route(
            "/api/characters/claim",
            post(routes::characters::claim_character),
        )
        .route(
            "/api/characters/action",
            post(routes::characters::execute_character_action),
        )
        // 4. Campaign Timekeeper & Calendar Endpoints
        .route(
            "/api/campaign/calendar",
            get(routes::calendar::get_current_calendar),
        )
        .route(
            "/api/campaign/advance",
            post(routes::calendar::advance_time),
        )
        .route(
            "/api/campaign/time",
            get(routes::campaign_dir::get_campaign_time)
                .post(routes::campaign_dir::advance_campaign_time_seconds),
        )
        .route(
            "/api/campaign/time/advance",
            post(routes::campaign_dir::advance_campaign_time_seconds),
        )
        .route(
            "/api/campaign/export",
            post(routes::campaign_dir::export_campaign_bundle),
        )
        .route(
            "/api/campaign/import",
            post(routes::campaign_dir::import_campaign_bundle),
        )
        .route(
            "/api/map/save_vector",
            post(routes::campaign_dir::save_map_vector_geometry_endpoint),
        )
        .route(
            "/api/system/network-info",
            get(routes::campaign::get_network_info),
        )
        // 4b. Campaign Directory Storage & Unified Asset Pipeline
        .route(
            "/api/campaign/directory/current",
            get(routes::campaign_dir::get_current_directory),
        )
        .route(
            "/api/campaign/directory/status",
            get(routes::campaign_dir::get_campaign_directory_status),
        )
        .route(
            "/api/campaign/directory/select",
            post(routes::campaign_dir::select_campaign_directory),
        )
        .route(
            "/api/campaign/directory/set",
            post(routes::campaign_dir::set_campaign_directory),
        )
        .route(
            "/api/campaign/assets",
            get(routes::campaign_dir::list_campaign_assets_route),
        )
        .route(
            "/api/campaign/assets/browse",
            get(routes::campaign_dir::list_campaign_assets_route),
        )
        .route(
            "/api/campaign/assets/upload",
            post(crate::api::assets::upload_asset).layer(DefaultBodyLimit::max(100 * 1024 * 1024)),
        )
        .route(
            "/api/campaign/assets/*path",
            get(crate::api::assets::serve_asset),
        )
        .route(
            "/api/campaign/assets/save",
            post(routes::campaign_dir::save_campaign_asset),
        )
        .route(
            "/api/campaign/ingest/scan",
            post(routes::campaign_dir::scan_ingest_directory_route),
        )
        .route(
            "/api/campaign/directory/verify-scaffold",
            post(routes::campaign_dir::verify_and_scaffold_campaign),
        )
        // 4c. Lore Engine & Categorized Entity Ingestion
        .route("/api/lore/ingest", post(routes::lore::ingest_lore))
        .route("/api/lore/search", get(routes::lore::search_lore))
        .route("/api/campaign/monsters", post(routes::lore::save_monster))
        .route("/api/compendium/spells", post(routes::lore::save_spell))
        .route("/api/compendium/items", post(routes::lore::save_item))
        // 4d. Community Plugin Discovery & Sandbox Registry
        .route("/api/plugins", get(routes::plugins::list_plugins_route))
        .route(
            "/api/plugins/external",
            get(routes::plugins::list_external_plugins_route),
        )
        .route(
            "/api/plugins/sideload",
            post(routes::plugins::sideload_plugin_route),
        )
        .route(
            "/plugins/*path",
            get(routes::plugins::serve_plugin_static),
        )
        // 5. DM Encounter Tracker & Monster Spawning Endpoints
        .route("/api/encounter/active", get(routes::encounter::get_active))
        .route(
            "/api/encounter/next_turn",
            post(routes::encounter::advance_turn),
        )
        .route(
            "/api/encounter/prev_turn",
            post(routes::encounter::rewind_turn),
        )
        .route(
            "/api/encounter/adjust_hp",
            post(routes::encounter::modify_hp),
        )
        .route(
            "/api/encounter/toggle_condition",
            post(routes::encounter::toggle_condition),
        )
        .route(
            "/api/encounter/monsters",
            get(routes::encounter::get_monsters),
        )
        .route(
            "/api/encounter/spawn_token",
            post(routes::encounter::spawn_token),
        )
        // 5b. Scene Tokens & Clone-on-Spawn Endpoints
        .route(
            "/api/scenes/:scene_id/tokens/spawn",
            post(crate::api::tokens::spawn_scene_token),
        )
        .route(
            "/api/scenes/:scene_id/tokens",
            get(crate::api::tokens::list_scene_tokens),
        )
        .route(
            "/api/scenes/:scene_id/tokens/:instance_id",
            patch(crate::api::tokens::update_scene_token).get(crate::api::tokens::get_scene_token),
        )
        .route(
            "/api/scenes/:scene_id/tokens/:instance_id/lease",
            post(crate::api::tokens::request_token_lease),
        )
        // 5c. Epoch Resync (missed-event catchup for reconnecting clients)
        .route("/api/sync/epoch", get(crate::api::sync::get_epoch_delta))
        // 5d. Staging Curtain ("Blackout Veil") Control
        .route("/api/scene/curtain", post(crate::api::curtain::set_curtain))
        // 6. Essence Crafting Matrix & Sockets Endpoints
        .route(
            "/api/crafting/essences",
            get(routes::crafting::list_essences),
        )
        .route(
            "/api/crafting/evaluate",
            post(routes::crafting::evaluate_matrix),
        )
        .route(
            "/api/crafting/sockets/:item_id",
            get(routes::crafting::get_item_sockets),
        )
        .route(
            "/api/crafting/socket",
            post(routes::crafting::socket_essence),
        )
        // 7. Settlement Profile & Regional Notice Board Endpoints
        .route(
            "/api/settlements/ostrava",
            get(routes::settlement::get_ostrava_profile),
        )
        // 8. WebSocket Synchronization Hub
        .route("/ws", get(routes::ws::ws_handler))
        // 9. Mobile Companion Relay & Discovery Endpoints
        .route(
            "/api/companion/status",
            get(companion_hub::get_companion_status),
        )
        .route(
            "/api/companion/config",
            post(companion_hub::set_companion_config),
        )
        .route(
            "/api/companion/network-info",
            get(companion_hub::get_companion_network_info),
        )
        .route(
            "/api/companion/sessions",
            get(companion_hub::get_active_sessions),
        )
        .route(
            "/api/companion/sessions/:session_id/promote",
            post(companion_hub::promote_session_role),
        )
        .route(
            "/api/companion/tokens/:token_id/owners",
            post(companion_hub::assign_token_owners),
        )
        .route("/ws/companion", get(companion_hub::companion_ws_handler))
        // 10. System & Local Network Discovery
        .route(
            "/api/system/connection-info",
            get(routes::system::get_connection_info),
        )
        // Catch-all fallback for client-side routing
        .fallback(routes::assets::serve_index)
        .layer(DefaultBodyLimit::max(250 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

/// Attempts to bind a TcpListener dynamically across a fallback port range, handling AddrInUse.
pub async fn bind_dynamic_listener(
    start_port: u16,
    end_port: u16,
) -> Result<(tokio::net::TcpListener, u16), std::io::Error> {
    for port in start_port..=end_port {
        match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        "All ports in fallback range are occupied",
    ))
}

/// Runs the local-first embedded Axum server inside Tauri 2 running on Tokio
/// with dynamic port fallback (4242..=4252).
pub async fn run_server(
    state: AppState,
    _bind_addr: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Clone the Arc and ws_sender before state is moved into create_router.
    let lease_map = state.lease_map.clone();
    let ws_sender = state.ws_sender.clone();
    let router = create_router(state);

    let (listener, port) = bind_dynamic_listener(4242, 4252).await?;
    let port_file = std::env::temp_dir().join("graywood.port");
    let _ = std::fs::write(&port_file, port.to_string());
    println!(
        "Starting embedded Axum server on http://0.0.0.0:{} (recorded at {:?})",
        port, port_file
    );

    // Spawn ephemeral lease pruner – removes expired token leases every second.
    crate::state::lease::spawn_lease_pruner(lease_map, Some(ws_sender));

    let res = axum::serve(listener, router).await;
    let _ = std::fs::remove_file(&port_file);
    res?;
    Ok(())
}

async fn upload_asset_handler(
    State(state): State<AppState>,
    mut multipart: axum::extract::Multipart,
) -> Result<axum::Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let mut category = "maps".to_string();
    let mut file_ext = "png".to_string();
    let mut file_bytes = Vec::new();

    while let Some(mut field) = multipart.next_field().await.map_err(|e| {
        (axum::http::StatusCode::BAD_REQUEST, format!("Multipart error: {}", e))
    })? {
        let field_name = field.name().map(|s| s.to_string());
        if field_name.as_deref() == Some("category") {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim().to_lowercase();
                if ["maps", "tokens", "audio", "models"].contains(&trimmed.as_str()) {
                    category = trimmed;
                }
            }
            continue;
        }

        let fname = field.file_name().map(|s| s.to_string());
        if fname.is_some() || field_name.as_deref() == Some("file") || field_name.as_deref() == Some("asset") {
            if let Some(ref name) = fname {
                if let Some(ext) = std::path::Path::new(name).extension().and_then(|e| e.to_str()) {
                    file_ext = ext.trim_start_matches('.').to_lowercase();
                }
            }
            while let Some(chunk) = field.chunk().await.map_err(|e| {
                (axum::http::StatusCode::BAD_REQUEST, format!("Chunk read error: {}", e))
            })? {
                file_bytes.extend_from_slice(&chunk);
            }
        }
    }

    if file_bytes.is_empty() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "File is empty".to_string()));
    }

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let hash_hex = hex::encode(hasher.finalize());
    let filename = format!("{}.{}", &hash_hex[..16], file_ext);

    let app_data_dir = std::path::PathBuf::from("./app_data/assets").join(&category);
    let _ = tokio::fs::create_dir_all(&app_data_dir).await;
    let _ = tokio::fs::write(app_data_dir.join(&filename), &file_bytes).await;

    let dist_assets_dir = state.assets_dir.join("assets").join(&category);
    let _ = tokio::fs::create_dir_all(&dist_assets_dir).await;
    let _ = tokio::fs::write(dist_assets_dir.join(&filename), &file_bytes).await;

    let url = format!("/assets/{}/{}", category, filename);
    Ok(axum::Json(serde_json::json!({ "url": url })))
}

async fn ollama_proxy_handler(
    axum::Json(payload): axum::Json<serde_json::Value>,
) -> Result<axum::response::Response, (axum::http::StatusCode, String)> {
    let body_str = serde_json::to_string(&payload).map_err(|e| {
        (axum::http::StatusCode::BAD_REQUEST, format!("Invalid JSON payload: {}", e))
    })?;

    let endpoint = if payload.get("messages").is_some() {
        "/api/chat"
    } else {
        "/api/generate"
    };

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut stream = tokio::net::TcpStream::connect("127.0.0.1:11434").await.map_err(|e| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            format!("Failed to connect to Ollama at 127.0.0.1:11434: {}", e),
        )
    })?;

    let req = format!(
        "POST {} HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        endpoint,
        body_str.len(),
        body_str
    );

    stream.write_all(req.as_bytes()).await.map_err(|e| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            format!("Failed to send request to Ollama: {}", e),
        )
    })?;

    let mut resp_bytes = Vec::new();
    stream.read_to_end(&mut resp_bytes).await.map_err(|e| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            format!("Failed to read response from Ollama: {}", e),
        )
    })?;

    if let Some(pos) = resp_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
        let headers_part = &resp_bytes[..pos];
        let body_part = &resp_bytes[pos + 4..];

        let is_chunked = String::from_utf8_lossy(headers_part)
            .to_lowercase()
            .contains("transfer-encoding: chunked");

        let body_bytes = if is_chunked {
            decode_chunked_body(body_part)
        } else {
            body_part.to_vec()
        };

        let mut response = axum::response::Response::new(axum::body::Body::from(body_bytes));
        *response.status_mut() = axum::http::StatusCode::OK;
        response.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("application/json"),
        );
        Ok(response)
    } else {
        let mut response = axum::response::Response::new(axum::body::Body::from(resp_bytes));
        *response.status_mut() = axum::http::StatusCode::OK;
        Ok(response)
    }
}

fn decode_chunked_body(mut data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while !data.is_empty() {
        if let Some(idx) = data.windows(2).position(|w| w == b"\r\n") {
            let len_str = match std::str::from_utf8(&data[..idx]) {
                Ok(s) => s.trim(),
                Err(_) => break,
            };
            let chunk_len = match usize::from_str_radix(len_str, 16) {
                Ok(l) => l,
                Err(_) => break,
            };
            if chunk_len == 0 {
                break;
            }
            let chunk_start = idx + 2;
            let chunk_end = chunk_start + chunk_len;
            if chunk_end <= data.len() {
                out.extend_from_slice(&data[chunk_start..chunk_end]);
                data = if chunk_end + 2 <= data.len() {
                    &data[chunk_end + 2..]
                } else {
                    &data[chunk_end..]
                };
            } else {
                out.extend_from_slice(&data[chunk_start..]);
                break;
            }
        } else {
            break;
        }
    }
    if out.is_empty() {
        data.to_vec()
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_in_memory_db;
    use crate::models::Character;
    use axum::{
        body::{to_bytes, Body},
        http::{header, Request, StatusCode},
    };
    use serde_json::{json, Value};
    use std::path::PathBuf;
    use tower::ServiceExt;

    fn setup_test_app() -> (Router, AppState) {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let test_char = Character {
            id: "test-hero-1".to_string(),
            name: "Kaelen Emberfall".to_string(),
            pin: "1357".to_string(),
            current_hp: 35,
            max_hp: 35,
            temp_hp: 0,
            hit_dice_current: 5,
            hit_dice_max: 5,
            base_ac: 16,
            speed: 30,
            passive_perception: 13,
            spell_slots_json: r#"{"level_1":{"max":4,"used":0},"level_2":{"max":2,"used":0},"level_3":{"max":0,"used":0},"level_4":{"max":0,"used":0},"level_5":{"max":0,"used":0},"level_6":{"max":0,"used":0},"level_7":{"max":0,"used":0},"level_8":{"max":0,"used":0},"level_9":{"max":0,"used":0}}"#.to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: false,
            resurrection_sickness_penalty: 0,
        };
        test_char.insert(&conn).unwrap();

        let state = AppState::new(
            conn,
            b"test_secret_key_0123456789abcdef".to_vec(),
            PathBuf::from("./non_existent_dist"),
        );
        let router = create_router(state.clone());
        (router, state)
    }

    #[tokio::test]
    async fn test_get_compendium_classes() {
        let (app, _) = setup_test_app();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/compendium/classes")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 64).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["count"], 12);
    }

    #[tokio::test]
    async fn test_get_compendium_spells_filtered() {
        let (app, _) = setup_test_app();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/compendium/spells?level=3&class=Wizard")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 64).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["success"], true);
        let spells = json["spells"].as_array().unwrap();
        assert!(spells.iter().any(|s| s["name"] == "Fireball"));
        assert!(spells.iter().any(|s| s["name"] == "Counterspell"));
    }

    #[tokio::test]
    async fn test_get_public_roster_excludes_pin() {
        let (app, _) = setup_test_app();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/characters/roster")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 64).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["success"], true);
        let roster = json["characters"].as_array().unwrap();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0]["id"], "test-hero-1");
        assert_eq!(roster[0]["name"], "Kaelen Emberfall");
        assert_eq!(roster[0]["is_orb_sealed"], false);
        // Verify PIN is not leaked
        assert!(roster[0].get("pin").is_none());
    }

    #[tokio::test]
    async fn test_pin_claim_and_action_flow() {
        let (app, state) = setup_test_app();

        // 1. Invalid PIN attempt
        let invalid_claim = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/characters/claim")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "character_id": "test-hero-1",
                            "pin": "0000"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(invalid_claim.status(), StatusCode::UNAUTHORIZED);

        // 2. Valid PIN claim
        let valid_claim = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/characters/claim")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "character_id": "test-hero-1",
                            "pin": "1357"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(valid_claim.status(), StatusCode::OK);
        let claim_body = to_bytes(valid_claim.into_body(), 1024 * 64).await.unwrap();
        let claim_json: Value = serde_json::from_slice(&claim_body).unwrap();
        let token = claim_json["token"].as_str().unwrap();
        assert!(!token.is_empty());

        // 3. Mutate HP with Bearer token
        let mut rx = state.ws_sender.subscribe();

        let action_res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/characters/action")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {}", token))
                    .body(Body::from(
                        json!({
                            "character_id": "test-hero-1",
                            "action": {
                                "type": "MUTATE_HP",
                                "current_hp": 28,
                                "temp_hp": 6
                            }
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(action_res.status(), StatusCode::OK);
        let action_body = to_bytes(action_res.into_body(), 1024 * 64).await.unwrap();
        let action_json: Value = serde_json::from_slice(&action_body).unwrap();
        assert_eq!(action_json["character"]["current_hp"], 28);
        assert_eq!(action_json["character"]["temp_hp"], 6);

        // Check that WebSocket broadcasted HP_UPDATE
        let broadcasted = rx.recv().await.unwrap();
        match broadcasted {
            WsEvent::HpUpdate {
                character_id,
                current_hp,
                temp_hp,
            } => {
                assert_eq!(character_id, "test-hero-1");
                assert_eq!(current_hp, 28);
                assert_eq!(temp_hp, 6);
            }
            other => panic!("Unexpected event broadcasted: {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_static_asset_fallback() {
        let (app, _) = setup_test_app();

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 64).await.unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("Graywood VTT") || html.contains("0.0.0.0:5174"));
    }

    #[tokio::test]
    async fn test_bind_dynamic_listener() {
        let (listener, port) = bind_dynamic_listener(4242, 4252).await.expect(
            "bind_dynamic_listener should bind successfully to an available port in 4242..=4252",
        );
        assert!((4242..=4252).contains(&port));
        let local_addr = listener.local_addr().expect("local_addr should succeed");
        assert_eq!(local_addr.port(), port);
    }
}
