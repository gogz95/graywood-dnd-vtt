// src-tauri/tests/asset_pipeline.rs
// Integration tests for campaign local asset ingestion, SHA-256 deduplication,
// payload size limits, and POSIX path normalization.

use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use graywood_vtt_lib::{
    api::assets::AssetUploadResponse,
    db::init_in_memory_db,
    server::{create_router, AppState},
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;

async fn setup_test_app(campaign_root: PathBuf) -> (axum::Router, AppState) {
    let conn = init_in_memory_db().expect("Failed to initialize test DB");
    let state = AppState::new(
        conn,
        b"test_secret_key_0123456789abcdef".to_vec(),
        campaign_root.clone(),
    );
    *state.campaign_dir.write().await = Some(campaign_root);
    let router = create_router(state.clone());
    (router, state)
}

fn create_temp_test_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let temp_dir = std::env::temp_dir().join(format!("{}_{}", prefix, nanos));
    std::fs::create_dir_all(&temp_dir).expect("Failed to create temp test directory");
    temp_dir
}

fn build_multipart_body(
    boundary: &str,
    field_name: &str,
    filename: &str,
    content_type: &str,
    content: &[u8],
    category: Option<&str>,
) -> Vec<u8> {
    let mut body = Vec::new();
    if let Some(cat) = category {
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"category\"\r\n\r\n");
        body.extend_from_slice(cat.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: {}\r\n\r\n",
            field_name, filename, content_type
        )
        .as_bytes(),
    );
    body.extend_from_slice(content);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
    body
}

#[tokio::test]
async fn test_upload_dummy_file_sha256_and_posix_path() {
    let temp_dir = create_temp_test_dir("graywood_asset_upload_test");
    let (app, _) = setup_test_app(temp_dir.clone()).await;

    let dummy_bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00dummy_battlemap_data";
    let expected_hash = hex::encode(Sha256::digest(dummy_bytes));
    let boundary = "---------------------------boundary12345";

    let multipart_data = build_multipart_body(
        boundary,
        "file",
        "dungeon_level_1.webp",
        "image/webp",
        dummy_bytes,
        Some("maps"),
    );

    let req = Request::builder()
        .method("POST")
        .uri("/api/campaign/assets/upload")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(multipart_data))
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body_bytes = to_bytes(res.into_body(), 10 * 1024 * 1024).await.unwrap();
    let upload_res: AssetUploadResponse =
        serde_json::from_slice(&body_bytes).expect("Failed to parse AssetUploadResponse");

    // 1. Verify SHA-256 hash is produced accurately
    assert_eq!(upload_res.hash, expected_hash);

    // 2. Verify relative path matches POSIX format (no backslashes, forward slashes only)
    let expected_rel_path = format!("assets/maps/{}.webp", expected_hash);
    assert_eq!(upload_res.path, expected_rel_path);
    assert!(
        !upload_res.path.contains('\\'),
        "Relative path must strictly use POSIX forward slashes"
    );
    assert!(!upload_res.deduplicated);

    // 3. Verify file was saved to disk at target directory
    let disk_file = temp_dir
        .join("assets")
        .join("maps")
        .join(format!("{}.webp", expected_hash));
    assert!(disk_file.exists(), "Target file must exist on disk");
    let saved_content = std::fs::read(&disk_file).expect("Failed reading saved asset");
    assert_eq!(saved_content, dummy_bytes);

    // 4. Verify Static Asset Service serves the asset with cache headers
    let serve_req = Request::builder()
        .method("GET")
        .uri(format!("/api/campaign/assets/maps/{}.webp", expected_hash))
        .body(Body::empty())
        .unwrap();

    let serve_res = app.oneshot(serve_req).await.unwrap();
    assert_eq!(serve_res.status(), StatusCode::OK);
    assert_eq!(
        serve_res
            .headers()
            .get(header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok()),
        Some("public, max-age=31536000, immutable")
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_upload_identical_file_deduplication() {
    let temp_dir = create_temp_test_dir("graywood_asset_dedup_test");
    let (app, _) = setup_test_app(temp_dir.clone()).await;

    let dummy_bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00token_goblin_image_bytes";
    let expected_hash = hex::encode(Sha256::digest(dummy_bytes));
    let boundary = "---------------------------boundary54321";

    let multipart_data = build_multipart_body(
        boundary,
        "file",
        "goblin.webp",
        "image/webp",
        dummy_bytes,
        Some("tokens"),
    );

    // First upload: creates the file
    let req1 = Request::builder()
        .method("POST")
        .uri("/api/campaign/assets/upload")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(multipart_data.clone()))
        .unwrap();

    let res1 = app.clone().oneshot(req1).await.unwrap();
    assert_eq!(res1.status(), StatusCode::OK);

    let body_bytes1 = to_bytes(res1.into_body(), 10 * 1024 * 1024).await.unwrap();
    let upload_res1: AssetUploadResponse = serde_json::from_slice(&body_bytes1).unwrap();
    assert_eq!(upload_res1.deduplicated, false);
    assert_eq!(upload_res1.hash, expected_hash);
    assert_eq!(upload_res1.path, format!("assets/tokens/{}.webp", expected_hash));

    let tokens_dir = temp_dir.join("assets").join("tokens");
    let files_count_after_first = std::fs::read_dir(&tokens_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .count();
    assert_eq!(files_count_after_first, 1);

    // Second upload with identical bytes: must deduplicate and bypass write
    let req2 = Request::builder()
        .method("POST")
        .uri("/api/campaign/assets/upload")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(multipart_data))
        .unwrap();

    let res2 = app.clone().oneshot(req2).await.unwrap();
    assert_eq!(res2.status(), StatusCode::OK);

    let body_bytes2 = to_bytes(res2.into_body(), 10 * 1024 * 1024).await.unwrap();
    let upload_res2: AssetUploadResponse = serde_json::from_slice(&body_bytes2).unwrap();
    assert_eq!(
        upload_res2.deduplicated, true,
        "Second upload of identical file must be marked deduplicated"
    );
    assert_eq!(upload_res2.hash, expected_hash);
    assert_eq!(upload_res2.path, format!("assets/tokens/{}.webp", expected_hash));

    // Verify still exactly one file on disk (no duplicate file created)
    let files_count_after_second = std::fs::read_dir(&tokens_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .count();
    assert_eq!(
        files_count_after_second, 1,
        "Second upload must not create additional files on disk"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_upload_oversized_payload_returns_413() {
    let temp_dir = create_temp_test_dir("graywood_asset_limit_test");
    let (app, _) = setup_test_app(temp_dir.clone()).await;

    // Stream valid multipart headers followed by 101 chunks of 1MB = 101MB (> 100MB body limit)
    let boundary = "---------------------------boundaryOversize";
    let header_prefix = format!(
        "--{}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"huge.webp\"\r\nContent-Type: image/webp\r\n\r\n",
        boundary
    );
    const CHUNK: &[u8] = &[0u8; 1024 * 1024];
    let mut chunks: Vec<Result<axum::body::Bytes, std::io::Error>> = Vec::new();
    chunks.push(Ok(axum::body::Bytes::from(header_prefix)));
    for _ in 0..101 {
        chunks.push(Ok(axum::body::Bytes::from_static(CHUNK)));
    }
    chunks.push(Ok(axum::body::Bytes::from(format!("\r\n--{}--\r\n", boundary))));
    let body = Body::from_stream(futures_util::stream::iter(chunks));

    let req = Request::builder()
        .method("POST")
        .uri("/api/campaign/assets/upload")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(body)
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(
        res.status(),
        StatusCode::PAYLOAD_TOO_LARGE,
        "Payload exceeding 100MB limit must return HTTP 413 Payload Too Large"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}
