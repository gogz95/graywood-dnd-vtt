// src-tauri/tests/token_spawn.rs
// Integration tests verifying compendium entity templates, clone-on-spawn token instantiations,
// sequential auto-numbering, and instance template immutability.

use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use graywood_vtt_lib::{
    api::tokens::SceneToken,
    db::init_in_memory_db,
    server::{create_router, AppState},
};
use serde_json::json;
use std::path::PathBuf;
use tower::ServiceExt;

async fn setup_test_app() -> (axum::Router, AppState) {
    let conn = init_in_memory_db().expect("Failed to initialize in-memory DB with migrations");

    // Seed scene-1 to fulfill foreign key constraint on scene_tokens
    conn.execute(
        "INSERT INTO scenes (id, name, asset_path, grid_type, grid_size)
         VALUES ('scene-1', 'Dungeon Hall', '', 'square', 100.0);",
        [],
    )
    .expect("Failed to seed scene-1");

    let state = AppState::new(
        conn,
        b"test_secret_key_0123456789abcdef".to_vec(),
        PathBuf::from("./temp_test_assets"),
    );
    let router = create_router(state.clone());
    (router, state)
}

#[tokio::test]
async fn test_clone_on_spawn_sequential_numbering_and_template_immutability() {
    let (app, state) = setup_test_app().await;

    // 1. Seed base compendium entity "Orc" with hp: 15
    {
        let conn = state.db.lock().await;
        conn.execute(
            "INSERT INTO compendium_entities (id, name, category, source_pack, is_custom, data_json, created_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6);",
            rusqlite::params![
                "comp-orc-template",
                "Orc",
                "monster",
                "srd-5.1",
                json!({ "hp": 15, "max_hp": 15, "armor_class": 13 }).to_string(),
                1700000000i64,
            ],
        )
        .expect("Failed seeding compendium entity Orc");
    }

    // 2. Spawn first token on scene-1
    let spawn_req_1 = Request::builder()
        .method("POST")
        .uri("/api/scenes/scene-1/tokens/spawn")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "entity_id": "comp-orc-template",
                "x": 100.0,
                "y": 150.0
            })
            .to_string(),
        ))
        .unwrap();

    let spawn_res_1 = app.clone().oneshot(spawn_req_1).await.unwrap();
    assert_eq!(spawn_res_1.status(), StatusCode::OK);

    let body_bytes_1 = to_bytes(spawn_res_1.into_body(), 1024 * 1024).await.unwrap();
    let token_1: SceneToken = serde_json::from_slice(&body_bytes_1).expect("Failed parsing token 1");

    // Assert named "Orc 1" with unique instance ID and copied data
    assert_eq!(token_1.name, "Orc 1");
    assert_eq!(token_1.scene_id, "scene-1");
    assert_eq!(token_1.entity_id.as_deref(), Some("comp-orc-template"));
    assert_eq!(token_1.x, 100.0);
    assert_eq!(token_1.y, 150.0);
    assert_eq!(token_1.instance_id.len(), 36, "Instance ID must be valid UUID format");

    let parsed_data_1: serde_json::Value = serde_json::from_str(&token_1.system_data_json).unwrap();
    assert_eq!(parsed_data_1["hp"], 15);

    // 3. Spawn second token on scene-1
    let spawn_req_2 = Request::builder()
        .method("POST")
        .uri("/api/scenes/scene-1/tokens/spawn")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "entity_id": "comp-orc-template",
                "x": 200.0,
                "y": 250.0
            })
            .to_string(),
        ))
        .unwrap();

    let spawn_res_2 = app.clone().oneshot(spawn_req_2).await.unwrap();
    assert_eq!(spawn_res_2.status(), StatusCode::OK);

    let body_bytes_2 = to_bytes(spawn_res_2.into_body(), 1024 * 1024).await.unwrap();
    let token_2: SceneToken = serde_json::from_slice(&body_bytes_2).expect("Failed parsing token 2");

    // Assert named "Orc 2" with distinct instance ID
    assert_eq!(token_2.name, "Orc 2");
    assert_eq!(token_2.scene_id, "scene-1");
    assert_ne!(token_1.instance_id, token_2.instance_id);

    // 4. Mutate "Orc 1" current HP to 8
    let mutate_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/scenes/scene-1/tokens/{}", token_1.instance_id))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "system_data_json": json!({ "hp": 8, "max_hp": 15, "armor_class": 13 }).to_string()
            })
            .to_string(),
        ))
        .unwrap();

    let mutate_res = app.clone().oneshot(mutate_req).await.unwrap();
    assert_eq!(mutate_res.status(), StatusCode::OK);

    let mutated_bytes = to_bytes(mutate_res.into_body(), 1024 * 1024).await.unwrap();
    let mutated_token_1: SceneToken = serde_json::from_slice(&mutated_bytes).unwrap();
    let mutated_data_1: serde_json::Value =
        serde_json::from_str(&mutated_token_1.system_data_json).unwrap();
    assert_eq!(mutated_data_1["hp"], 8);

    // 5. Assert "Orc 2" remains unchanged (hp: 15)
    let get_token_2_req = Request::builder()
        .method("GET")
        .uri(format!("/api/scenes/scene-1/tokens/{}", token_2.instance_id))
        .body(Body::empty())
        .unwrap();

    let get_token_2_res = app.clone().oneshot(get_token_2_req).await.unwrap();
    assert_eq!(get_token_2_res.status(), StatusCode::OK);

    let get_token_2_bytes = to_bytes(get_token_2_res.into_body(), 1024 * 1024).await.unwrap();
    let fetched_token_2: SceneToken = serde_json::from_slice(&get_token_2_bytes).unwrap();
    let parsed_data_2: serde_json::Value =
        serde_json::from_str(&fetched_token_2.system_data_json).unwrap();
    assert_eq!(
        parsed_data_2["hp"], 15,
        "Orc 2 must retain its independent HP of 15 after Orc 1 mutation"
    );

    // 6. Assert base "Orc" template in compendium_entities remains unchanged (hp: 15)
    {
        let conn = state.db.lock().await;
        let base_data_json: String = conn
            .query_row(
                "SELECT data_json FROM compendium_entities WHERE id = 'comp-orc-template'",
                [],
                |row| row.get(0),
            )
            .expect("Failed to fetch base compendium entity Orc");

        let base_data: serde_json::Value = serde_json::from_str(&base_data_json).unwrap();
        assert_eq!(
            base_data["hp"], 15,
            "Base compendium entity template must remain completely immutable"
        );
    }
}
