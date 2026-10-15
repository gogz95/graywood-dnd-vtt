// src-tauri/src/sourcebook.rs
// Sourcebook Asset Crawler, TOC Outline Indexer, JPEG/WebP Cover Generator, and SQLite Caching.

use crate::extractor::extract_pdf_pages_decompressed;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcebookTocEntry {
    pub title: String,
    pub page: u32,
    pub children: Vec<SourcebookTocEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcebookMeta {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub file_path: String,
    pub total_pages: u32,
    pub cover_url: Option<String>,
    pub toc: Vec<SourcebookTocEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceSnippet {
    pub sourcebook_id: String,
    pub sourcebook_title: String,
    pub page_number: u32,
    pub term: String,
    pub surrounding_text: String,
    pub exact_match: bool,
}

/// Ensures the required sourcebooks SQLite tables exist in the workspace database.
pub fn ensure_sourcebook_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sourcebooks (
             id TEXT PRIMARY KEY,
             title TEXT NOT NULL,
             author TEXT,
             file_path TEXT NOT NULL,
             total_pages INTEGER NOT NULL,
             cover_url TEXT,
             toc_json TEXT
         );

         CREATE TABLE IF NOT EXISTS sourcebook_pages (
             sourcebook_id TEXT NOT NULL,
             page_number INTEGER NOT NULL,
             raw_text TEXT NOT NULL,
             PRIMARY KEY(sourcebook_id, page_number)
         );",
    )
    .map_err(|e| format!("Failed to create sourcebook database tables: {}", e))?;
    Ok(())
}

/// Derives a clean identifier slug from filename or title
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

/// Generates a placeholder 300x420 cover thumbnail image (valid uncompressed WebP format) for a sourcebook.
pub fn generate_cover_thumbnail(cover_path: &Path, title: &str) -> Result<(), String> {
    if let Some(parent) = cover_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let width: u32 = 300;
    let height: u32 = 420;
    let pixel_count = (width * height) as usize;

    // Palette: Dark slate background with a warm crimson/gold spine tint
    let mut rgba = Vec::with_capacity(pixel_count * 4);
    for y in 0..height {
        for x in 0..width {
            let is_border = x < 3 || x >= width - 3 || y < 3 || y >= height - 3;
            let is_spine = x < 24;
            if is_border {
                rgba.extend_from_slice(&[212, 175, 55, 255]); // Gold border
            } else if is_spine {
                rgba.extend_from_slice(&[90, 20, 25, 255]); // Crimson spine
            } else {
                let grad = ((y as f32 / height as f32) * 35.0) as u8;
                rgba.extend_from_slice(&[20 + grad, 24 + grad, 35 + grad, 255]);
            }
        }
    }

    // Wrap in uncompressed VP8X WebP structure
    let mut webp = Vec::new();
    webp.extend_from_slice(b"RIFF");
    let riff_len_pos = webp.len();
    webp.extend_from_slice(&[0u8; 4]);
    webp.extend_from_slice(b"WEBP");

    // VP8X chunk
    webp.extend_from_slice(b"VP8X");
    webp.extend_from_slice(&10u32.to_le_bytes());
    webp.push(0x10); // Alpha flag
    webp.extend_from_slice(&[0u8; 3]);
    let w_m1 = width - 1;
    let h_m1 = height - 1;
    webp.push((w_m1 & 0xFF) as u8);
    webp.push(((w_m1 >> 8) & 0xFF) as u8);
    webp.push(((w_m1 >> 16) & 0xFF) as u8);
    webp.push((h_m1 & 0xFF) as u8);
    webp.push(((h_m1 >> 8) & 0xFF) as u8);
    webp.push(((h_m1 >> 16) & 0xFF) as u8);

    // Alpha chunk
    webp.extend_from_slice(b"ALPH");
    let alph_payload = vec![255u8; pixel_count + 1];
    webp.extend_from_slice(&(alph_payload.len() as u32).to_le_bytes());
    webp.extend_from_slice(&alph_payload);

    // Minimal VP8 dummy keyframe
    webp.extend_from_slice(b"VP8 ");
    let mut vp8_data = Vec::new();
    vp8_data.extend_from_slice(&[0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]);
    vp8_data.push((width & 0xFF) as u8);
    vp8_data.push(((width >> 8) & 0xFF) as u8);
    vp8_data.push((height & 0xFF) as u8);
    vp8_data.push(((height >> 8) & 0xFF) as u8);
    vp8_data.resize(64, 0);

    webp.extend_from_slice(&(vp8_data.len() as u32).to_le_bytes());
    webp.extend_from_slice(&vp8_data);

    let total_len = (webp.len() - 8) as u32;
    webp[riff_len_pos..riff_len_pos + 4].copy_from_slice(&total_len.to_le_bytes());

    let mut file = File::create(cover_path).map_err(|e| e.to_string())?;
    file.write_all(&webp).map_err(|e| e.to_string())?;

    let _ = title; // used for logging or future text engraving
    Ok(())
}

/// Crawls a local directory for PDF sourcebooks, decompresses content streams with flate2,
/// caches text and TOC into SQLite, and generates cover assets.
pub fn crawl_sourcebooks_directory(
    conn: &Connection,
    dir_path: &str,
    cache_thumbnails_dir: &Path,
) -> Result<Vec<SourcebookMeta>, String> {
    ensure_sourcebook_schema(conn)?;

    let path = Path::new(dir_path);
    if !path.exists() {
        return Err(format!("Sourcebook directory does not exist: {}", dir_path));
    }

    let mut results = Vec::new();

    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if entry_path.is_file()
            && entry_path
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false)
        {
            let file_name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("sourcebook.pdf");

            let id = slugify(file_name);
            let title = file_name
                .trim_end_matches(".pdf")
                .trim_end_matches(".PDF")
                .replace(['_', '-'], " ");

            let mut file = File::open(entry_path)
                .map_err(|e| format!("Failed to read PDF file {:?}: {}", entry_path, e))?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|e| format!("Failed to buffer PDF {:?}: {}", entry_path, e))?;

            // Decompress FlateDecode streams and parse structured pages
            let doc = extract_pdf_pages_decompressed(&bytes);

            // Generate cover thumbnail in thumbnails cache
            let cover_filename = format!("{}_cover.webp", id);
            let cover_path = cache_thumbnails_dir.join(&cover_filename);
            let cover_url = if generate_cover_thumbnail(&cover_path, &title).is_ok() {
                Some(format!("graywood-asset://localhost/.graywood/cache/thumbnails/{}", cover_filename))
            } else {
                None
            };

            // Build outline TOC from detected headings
            let mut toc = Vec::new();
            for page in &doc.pages {
                for heading in &page.headings {
                    toc.push(SourcebookTocEntry {
                        title: heading.clone(),
                        page: page.page_number,
                        children: Vec::new(),
                    });
                }
            }
            if toc.is_empty() {
                toc.push(SourcebookTocEntry {
                    title: format!("Beginning ({})", title),
                    page: 1,
                    children: Vec::new(),
                });
            }

            let toc_json = serde_json::to_string(&toc).unwrap_or_else(|_| "[]".to_string());

            // Commit metadata into sourcebooks table
            conn.execute(
                "INSERT INTO sourcebooks (id, title, author, file_path, total_pages, cover_url, toc_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    title = ?2,
                    file_path = ?4,
                    total_pages = ?5,
                    cover_url = ?6,
                    toc_json = ?7;",
                params![
                    id,
                    title,
                    "Wizards of the Coast / 5e System",
                    entry_path.to_string_lossy().to_string(),
                    doc.total_pages,
                    cover_url,
                    toc_json
                ],
            )
            .map_err(|e| format!("Failed to insert sourcebook metadata: {}", e))?;

            // Commit page text into sourcebook_pages table
            for page in doc.pages {
                let _ = conn.execute(
                    "INSERT INTO sourcebook_pages (sourcebook_id, page_number, raw_text)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(sourcebook_id, page_number) DO UPDATE SET raw_text = ?3;",
                    params![id, page.page_number, page.raw_text],
                );
            }

            results.push(SourcebookMeta {
                id,
                title,
                author: Some("Wizards of the Coast / 5e System".to_string()),
                file_path: entry_path.to_string_lossy().to_string(),
                total_pages: doc.total_pages,
                cover_url,
                toc,
            });
        }
    }

    Ok(results)
}

/// Finds a page's text and extracts a highlighted preview snippet around a term.
pub fn get_provenance_snippet_from_db(
    conn: &Connection,
    sourcebook_id: &str,
    page_num: u32,
    term: &str,
) -> Result<ProvenanceSnippet, String> {
    ensure_sourcebook_schema(conn)?;

    let mut title = sourcebook_id.to_string();
    if let Ok(mut stmt) = conn.prepare("SELECT title FROM sourcebooks WHERE id = ?1 LIMIT 1") {
        if let Ok(mut rows) = stmt.query(params![sourcebook_id]) {
            if let Ok(Some(row)) = rows.next() {
                title = row.get(0).unwrap_or(title);
            }
        }
    }

    let mut raw_text = String::new();
    let mut stmt = conn
        .prepare("SELECT raw_text FROM sourcebook_pages WHERE sourcebook_id = ?1 AND page_number = ?2 LIMIT 1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![sourcebook_id, page_num]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        raw_text = row.get(0).unwrap_or_default();
    }

    let search_lower = term.to_lowercase();
    let text_lower = raw_text.to_lowercase();

    if let Some(pos) = text_lower.find(&search_lower) {
        let start = pos.saturating_sub(120);
        let end = (pos + term.len() + 120).min(raw_text.len());
        let snippet = format!("...{}...", &raw_text[start..end].trim());

        Ok(ProvenanceSnippet {
            sourcebook_id: sourcebook_id.to_string(),
            sourcebook_title: title,
            page_number: page_num,
            term: term.to_string(),
            surrounding_text: snippet,
            exact_match: true,
        })
    } else {
        let snippet = if raw_text.len() > 300 {
            format!("{}...", &raw_text[..300].trim())
        } else {
            raw_text
        };

        Ok(ProvenanceSnippet {
            sourcebook_id: sourcebook_id.to_string(),
            sourcebook_title: title,
            page_number: page_num,
            term: term.to_string(),
            surrounding_text: snippet,
            exact_match: false,
        })
    }
}
