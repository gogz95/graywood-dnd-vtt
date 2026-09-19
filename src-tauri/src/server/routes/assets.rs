use crate::server::state::AppState;
use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, HeaderValue, Response, StatusCode},
    response::IntoResponse,
};
use std::path::PathBuf;

const FALLBACK_PWA_INDEX_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1b26">
  <meta name="description" content="Aleamos DM Desktop & Companion Player Client">
  <title>Aleamos DM Desktop</title>
  <style>
    :root {
      --bg: #0f111a;
      --card: #1a1c2e;
      --text: #e2e8f0;
      --accent: #d97706;
      --border: #2e344e;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2.5rem;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    h1 {
      color: var(--accent);
      margin-top: 0;
      font-size: 1.75rem;
      letter-spacing: 0.5px;
    }
    p {
      color: #94a3b8;
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      background: rgba(217, 119, 6, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(217, 119, 6, 0.4);
      padding: 0.4rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Aleamos DM Desktop</h1>
    <p>Local-First VTT Server is operational at <code>0.0.0.0:8080</code>.</p>
    <p>WebSocket sync hub and compendium API endpoints are active.</p>
    <div class="badge">Axum 0.7 &bull; Tauri 2 &bull; Tokio</div>
  </div>
</body>
</html>
"#;

/// Serves the root PWA index page from the client dist folder, or falls back to the embedded shell.
pub async fn serve_index(State(state): State<AppState>) -> impl IntoResponse {
    let index_file = state.assets_dir.join("index.html");
    if index_file.exists() {
        if let Ok(content) = tokio::fs::read(&index_file).await {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(content))
                .unwrap_or_else(|_| fallback_response());
        }
    }
    fallback_response()
}

/// Serves static assets from `/assets/*path` and root static files (`sw.js`, icons, WebP map tiles).
pub async fn serve_assets(
    AxumPath(path): AxumPath<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let safe_path = path.trim_start_matches('/').replace("..", "");

    // Check under assets/ subdirectory, public root, or base assets directory
    let candidate_file = if state.assets_dir.join("assets").join(&safe_path).is_file() {
        state.assets_dir.join("assets").join(&safe_path)
    } else if state.assets_dir.join(&safe_path).is_file() {
        state.assets_dir.join(&safe_path)
    } else {
        state.assets_dir.join("public").join(&safe_path)
    };

    if candidate_file.exists() && candidate_file.is_file() {
        if let Ok(bytes) = tokio::fs::read(&candidate_file).await {
            let mime = mime_guess::from_path(&candidate_file).first_or_octet_stream();
            let mut res = Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
                );

            // Explicit caching policy: Service worker must never be cached immutably
            if safe_path == "sw.js" || safe_path.ends_with("/sw.js") {
                res = res.header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate");
            } else if safe_path.ends_with(".webp")
                || safe_path.ends_with(".png")
                || safe_path.ends_with(".jpg")
                || safe_path.ends_with(".js")
                || safe_path.ends_with(".css")
            {
                // Compressed WebP map tiles, token textures, and immutable assets
                res = res.header(header::CACHE_CONTROL, "public, max-age=31536000, immutable");
            }

            return res
                .body(Body::from(bytes))
                .unwrap_or_else(|_| fallback_response());
        }
    }

    // SPA fallback: return index for unrecognized routes
    serve_index(State(state)).await.into_response()
}

fn fallback_response() -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(FALLBACK_PWA_INDEX_HTML))
        .unwrap()
}
