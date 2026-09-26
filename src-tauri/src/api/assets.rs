use axum::{
    body::Body,
    extract::{Multipart, Path as AxumPath, Query, State},
    http::{header, HeaderMap, Response, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::fs;

use crate::server::state::AppState;

pub trait PathExt {
    fn to_slash_lossy(&self) -> String;
}

impl PathExt for Path {
    fn to_slash_lossy(&self) -> String {
        self.to_string_lossy().replace('\\', "/")
    }
}

impl PathExt for PathBuf {
    fn to_slash_lossy(&self) -> String {
        self.as_path().to_slash_lossy()
    }
}

pub const ALLOWED_EXTENSIONS: &[&str] = &[
    "webp", "png", "jpg", "jpeg", "webm", "mp3", "ogg", "opus",
];

pub const ALLOWED_CATEGORIES: &[&str] = &["maps", "tokens", "audio"];

#[derive(Debug, Deserialize, Default)]
pub struct AssetUploadQuery {
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetUploadResponse {
    pub path: String,
    pub hash: String,
    pub deduplicated: bool,
}

pub fn extract_allowed_extension(
    filename: Option<&str>,
    content_type: Option<&str>,
) -> Option<String> {
    // 1. Check filename extension first
    if let Some(name) = filename {
        if let Some(ext) = Path::new(name).extension().and_then(|e| e.to_str()) {
            let clean_ext = ext.trim_start_matches('.').to_lowercase();
            if ALLOWED_EXTENSIONS.contains(&clean_ext.as_str()) {
                return Some(clean_ext);
            }
        }
    }

    // 2. Check MIME / Content-Type
    if let Some(mime) = content_type {
        let clean_mime = mime.split(';').next().unwrap_or(mime).trim().to_lowercase();
        let mapped = match clean_mime.as_str() {
            "image/webp" => Some("webp"),
            "image/png" => Some("png"),
            "image/jpeg" | "image/jpg" => Some("jpg"),
            "video/webm" => Some("webm"),
            "audio/mpeg" | "audio/mp3" => Some("mp3"),
            "audio/ogg" | "application/ogg" => Some("ogg"),
            "audio/opus" => Some("opus"),
            _ => None,
        };
        if let Some(ext) = mapped {
            if ALLOWED_EXTENSIONS.contains(&ext) {
                return Some(ext.to_string());
            }
        }
    }

    None
}

pub fn normalize_category(
    category_candidate: Option<&str>,
    ext: &str,
) -> Result<String, (StatusCode, String)> {
    if let Some(cat) = category_candidate {
        let clean = cat.trim().to_lowercase();
        if ALLOWED_CATEGORIES.contains(&clean.as_str()) {
            return Ok(clean);
        } else {
            return Err((
                StatusCode::BAD_REQUEST,
                format!(
                    "Invalid category '{}'. Allowed categories are: {:?}",
                    cat, ALLOWED_CATEGORIES
                ),
            ));
        }
    }

    // Inferred fallback from file extension
    match ext {
        "mp3" | "ogg" | "opus" => Ok("audio".to_string()),
        _ => Ok("maps".to_string()),
    }
}

/// Asset Upload Handler (`POST /api/campaign/assets/upload`):
/// Accepts multipart file streams, enforces body limits, hashes via SHA-256 on the fly,
/// deduplicates existing files on disk, writes new files atomically, and returns POSIX normalized paths.
pub async fn upload_asset(
    State(state): State<AppState>,
    Query(query): Query<AssetUploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<AssetUploadResponse>, (StatusCode, String)> {
    let mut form_category: Option<String> = None;
    let mut file_payload: Option<(String, String, Vec<u8>)> = None; // (extension, sha256_hex, bytes)

    while let Some(mut field) = multipart.next_field().await.map_err(|e| {
        (
            e.status(),
            format!("Failed to parse multipart field: {}", e),
        )
    })? {
        let field_name = field.name().map(|n| n.to_string());

        if field_name.as_deref() == Some("category") {
            if let Ok(text) = field.text().await {
                form_category = Some(text.trim().to_string());
            }
            continue;
        }

        let filename = field.file_name().map(|s| s.to_string());
        let content_type = field.content_type().map(|s| s.to_string());

        let is_file = filename.is_some()
            || field_name.as_deref() == Some("file")
            || field_name.as_deref() == Some("asset");

        if is_file && file_payload.is_none() {
            let ext = extract_allowed_extension(filename.as_deref(), content_type.as_deref())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        format!(
                            "Unlisted or missing file extension. Allowed extensions are: {:?}",
                            ALLOWED_EXTENSIONS
                        ),
                    )
                })?;

            let mut hasher = Sha256::new();
            let mut file_bytes = Vec::new();

            while let Some(chunk) = field.chunk().await.map_err(|e| {
                (
                    e.status(),
                    format!("Error reading upload file chunk: {}", e),
                )
            })? {
                hasher.update(&chunk);
                file_bytes.extend_from_slice(&chunk);
            }

            if file_bytes.is_empty() {
                return Err((StatusCode::BAD_REQUEST, "File payload is empty".to_string()));
            }

            let hash = hex::encode(hasher.finalize());
            file_payload = Some((ext, hash, file_bytes));
        }
    }

    let (ext, hash, file_bytes) = file_payload.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "No file content received in multipart payload".to_string(),
        )
    })?;

    let category = normalize_category(query.category.as_deref().or(form_category.as_deref()), &ext)?;

    // Resolve active campaign root
    let active_root = {
        let guard = state.campaign_dir.read().await;
        guard.clone().unwrap_or_else(|| state.assets_dir.clone())
    };

    let target_dir = active_root.join("assets").join(&category);
    fs::create_dir_all(&target_dir).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create asset destination directory: {}", e),
        )
    })?;

    let filename = format!("{}.{}", hash, ext);
    let target_file_path = target_dir.join(&filename);

    let deduplicated = target_file_path.exists();

    if !deduplicated {
        let temp_filename = format!(
            ".tmp_{}_{}",
            hash,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let temp_file_path = target_dir.join(&temp_filename);

        fs::write(&temp_file_path, &file_bytes).await.map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to write temporary asset file: {}", e),
            )
        })?;

        fs::rename(&temp_file_path, &target_file_path)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to atomically commit asset file: {}", e),
                )
            })?;
    }

    // POSIX path normalization: relative URI formatted strictly with POSIX forward slashes
    let relative_path_buf = PathBuf::from("assets").join(&category).join(&filename);
    let normalized_path = relative_path_buf.as_path().to_slash_lossy();

    Ok(Json(AssetUploadResponse {
        path: normalized_path,
        hash,
        deduplicated,
    }))
}

/// Static Asset Service (`GET /api/campaign/assets/*`):
/// Serves files from `<active_campaign_root>/assets/` with standard cache headers
/// and byte range request support.
pub async fn serve_asset(
    State(state): State<AppState>,
    AxumPath(path): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    let clean_path = path.trim_start_matches('/');
    if clean_path.contains("..") {
        return Err(StatusCode::FORBIDDEN);
    }

    let active_root = {
        let guard = state.campaign_dir.read().await;
        guard.clone().unwrap_or_else(|| state.assets_dir.clone())
    };

    let assets_dir = active_root.join("assets");
    let target_file = if clean_path.starts_with("assets/") {
        assets_dir.join(clean_path.strip_prefix("assets/").unwrap_or(clean_path))
    } else {
        assets_dir.join(clean_path)
    };

    let file_path = if target_file.exists() && target_file.is_file() {
        target_file
    } else {
        let alt = active_root.join(clean_path);
        if alt.exists() && alt.is_file() {
            alt
        } else {
            return Err(StatusCode::NOT_FOUND);
        }
    };

    let content = fs::read(&file_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_len = content.len() as u64;
    let mime = mime_guess::from_path(&file_path)
        .first_or_octet_stream()
        .to_string();

    // Check for Range header
    if let Some(range_header) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(spec) = range_header.strip_prefix("bytes=") {
            let parts: Vec<&str> = spec.split('-').collect();
            let start = parts.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let end = parts
                .get(1)
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(total_len.saturating_sub(1))
                .min(total_len.saturating_sub(1));

            if start <= end && start < total_len {
                let chunk = &content[start as usize..=end as usize];
                return Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_TYPE, mime)
                    .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                    .header(header::ACCEPT_RANGES, "bytes")
                    .header(
                        header::CONTENT_RANGE,
                        format!("bytes {}-{}/{}", start, end, total_len),
                    )
                    .header(header::CONTENT_LENGTH, (end - start + 1).to_string())
                    .body(Body::from(chunk.to_vec()))
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, total_len.to_string())
        .body(Body::from(content))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
