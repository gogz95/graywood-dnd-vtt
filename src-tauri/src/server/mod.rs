pub mod companion_hub;
pub mod error;
pub mod routes;
pub mod state;

pub use error::ServerError;
pub use routes::ws::WsEvent;
pub use state::AppState;

use axum::{
    extract::DefaultBodyLimit,
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
            get(routes::campaign_dir::get_campaign_time),
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
            post(crate::api::assets::upload_asset)
                .layer(DefaultBodyLimit::max(100 * 1024 * 1024)),
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
        // 4c. Community Plugin Discovery & Sandbox Registry
        .route("/api/plugins", get(routes::plugins::list_plugins_route))
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
            patch(crate::api::tokens::update_scene_token)
                .get(crate::api::tokens::get_scene_token),
        )
        .route(
            "/api/scenes/:scene_id/tokens/:instance_id/lease",
            post(crate::api::tokens::request_token_lease),
        )
        // 5c. Epoch Resync (missed-event catchup for reconnecting clients)
        .route(
            "/api/sync/epoch",
            get(crate::api::sync::get_epoch_delta),
        )
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
        // Catch-all fallback for client-side routing
        .fallback(routes::assets::serve_index)
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
    // Clone the Arc before state is moved into create_router.
    let lease_map = state.lease_map.clone();
    let router = create_router(state);

    let (listener, port) = bind_dynamic_listener(4242, 4252).await?;
    let port_file = std::env::temp_dir().join("graywood.port");
    let _ = std::fs::write(&port_file, port.to_string());
    println!(
        "[server] Axum server bound dynamically to port {} (recorded at {:?})",
        port, port_file
    );

    // Spawn ephemeral lease pruner – removes expired token leases every second.
    crate::state::lease::spawn_lease_pruner(lease_map);

    axum::serve(listener, router).await?;
    Ok(())
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
        let (listener, port) = bind_dynamic_listener(4242, 4252)
            .await
            .expect("bind_dynamic_listener should bind successfully to an available port in 4242..=4252");
        assert!(port >= 4242 && port <= 4252);
        let local_addr = listener.local_addr().expect("local_addr should succeed");
        assert_eq!(local_addr.port(), port);
    }
}
