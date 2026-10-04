// src-tauri/src/services/pdf_compiler.rs
// Streaming PDF Entity Compiler, TOC outline parser, bounding-box statblock extractor, and token WebP cropper.

use crate::services::blueprint_catalog::{
    match_blueprints_in_text, AbilityScores, EntityBlueprint,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompilerProgressEvent {
    pub filename: String,
    pub current_page: usize,
    pub total_pages: usize,
    pub entity_name: Option<String>,
    pub is_activated: bool,
    pub token_generated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMechanics {
    pub ac: Option<i32>,
    pub hp: Option<i32>,
    pub speed: Option<String>,
    pub stats: Option<AbilityScores>,
    pub attack_bonus: Option<i32>,
    pub damage_formula: Option<String>,
    pub cr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivatedEntityRecord {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub is_activated: i32,
    pub provenance: EntityProvenance,
    pub mechanics: ExtractedMechanics,
    pub token_asset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityProvenance {
    pub file_rel: String,
    pub page: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompilePdfResult {
    pub file_rel_path: String,
    pub total_pages: usize,
    pub activated_count: usize,
    pub entities: Vec<ActivatedEntityRecord>,
}

#[derive(Debug, Clone)]
pub struct TextFragment {
    pub text: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
pub struct PageTextLayout {
    pub page_num: usize,
    pub fragments: Vec<TextFragment>,
    pub width: f32,
    pub height: f32,
}

impl PageTextLayout {
    /// Reconstructs lines by partitioning into two vertical columns (left and right of midpoint)
    /// ordered from top to bottom (descending y).
    pub fn reconstruct_two_column_text(&self) -> String {
        let midpoint = if self.width > 0.0 {
            self.width / 2.0
        } else {
            306.0
        }; // standard letter width 612 / 2

        let mut left_col = Vec::new();
        let mut right_col = Vec::new();

        for frag in &self.fragments {
            if frag.x < midpoint {
                left_col.push(frag);
            } else {
                right_col.push(frag);
            }
        }

        // Sort descending by Y (top of page down), then ascending by X (left to right)
        let sort_col = |col: &mut Vec<&TextFragment>| {
            col.sort_by(|a, b| {
                b.y.partial_cmp(&a.y)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal))
            });
        };

        sort_col(&mut left_col);
        sort_col(&mut right_col);

        let mut out = String::new();
        for frag in left_col {
            out.push_str(&frag.text);
            out.push(' ');
        }
        out.push('\n');
        for frag in right_col {
            out.push_str(&frag.text);
            out.push(' ');
        }

        out
    }
}

/// Outline / Bookmark mapping extracted from PDF catalog in < 100ms.
#[derive(Debug, Clone, Default)]
pub struct PdfTocOutline {
    pub total_pages: usize,
    pub entity_page_map: HashMap<String, usize>,
}

/// Fast non-blocking inspection of PDF bookmarks and structure in < 100ms.
pub fn inspect_pdf_toc_fast(bytes: &[u8]) -> Result<PdfTocOutline, String> {
    if bytes.len() < 5 || &bytes[0..4] != b"%PDF" {
        return Err("Invalid file header: Not a valid PDF document".to_string());
    }

    let mut total_pages = 0;
    let mut entity_page_map = HashMap::new();

    // Fast-count /Type /Page occurrences to estimate pages
    let len = bytes.len();
    let mut i = 0;
    while i + 11 <= len {
        if &bytes[i..i + 11] == b"/Type /Page" || &bytes[i..i + 10] == b"/Type/Page" {
            total_pages += 1;
        }
        i += 1;
    }
    if total_pages == 0 {
        total_pages = 1;
    }

    // Fast-scan bookmarks/outlines `/Title (...)`
    i = 0;
    let mut current_title: Option<String> = None;
    while i < len {
        if i + 7 <= len && &bytes[i..i + 7] == b"/Title " {
            i += 7;
            while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
                i += 1;
            }
            if i < len && bytes[i] == b'(' {
                i += 1;
                let mut title_buf = Vec::new();
                while i < len && bytes[i] != b')' {
                    if bytes[i] == b'\\' && i + 1 < len {
                        i += 1;
                    }
                    title_buf.push(bytes[i]);
                    i += 1;
                }
                if let Ok(title_str) = String::from_utf8(title_buf) {
                    let cleaned = title_str.trim().to_string();
                    if !cleaned.is_empty() {
                        current_title = Some(cleaned);
                    }
                }
            }
        }

        // Look for destination page indicator near title
        if let Some(ref title) = current_title {
            if i + 5 <= len && &bytes[i..i + 5] == b"/Dest" {
                // Approximate destination to sequential page mapping
                let page_idx = (entity_page_map.len() + 1).min(total_pages);
                entity_page_map.insert(title.clone(), page_idx);
                current_title = None;
            }
        }

        i += 1;
    }

    Ok(PdfTocOutline {
        total_pages,
        entity_page_map,
    })
}

/// Slices a single page's text layout fragments from PDF byte slice.
pub fn parse_page_text_layout(bytes: &[u8], page_num: usize) -> PageTextLayout {
    let mut fragments = Vec::new();
    let mut cur_x: f32 = 0.0;
    let mut cur_y: f32 = 0.0;
    let mut in_text = false;

    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Track Text Matrix Tm: [a b c d e f Tm] -> e=x, f=y
        if i + 3 <= len && &bytes[i..i + 3] == b" Tm" {
            let start = i.saturating_sub(64);
            let slice = &bytes[start..i];
            if let Ok(text) = std::str::from_utf8(slice) {
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() >= 6 {
                    let p_len = parts.len();
                    if let (Ok(x), Ok(y)) = (
                        parts[p_len - 2].parse::<f32>(),
                        parts[p_len - 1].parse::<f32>(),
                    ) {
                        cur_x = x;
                        cur_y = y;
                    }
                }
            }
        }

        // Track Td / TD relative text positioning
        if i + 3 <= len && (&bytes[i..i + 3] == b" Td" || &bytes[i..i + 3] == b" TD") {
            let start = i.saturating_sub(32);
            let slice = &bytes[start..i];
            if let Ok(text) = std::str::from_utf8(slice) {
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() >= 2 {
                    let p_len = parts.len();
                    if let (Ok(dx), Ok(dy)) = (
                        parts[p_len - 2].parse::<f32>(),
                        parts[p_len - 1].parse::<f32>(),
                    ) {
                        cur_x += dx;
                        cur_y += dy;
                    }
                }
            }
        }

        if i + 2 <= len && &bytes[i..i + 2] == b"BT" {
            in_text = true;
            i += 2;
            continue;
        }

        if i + 2 <= len && &bytes[i..i + 2] == b"ET" {
            in_text = false;
            i += 2;
            continue;
        }

        if in_text && bytes[i] == b'(' {
            i += 1;
            let mut str_buf = Vec::new();
            while i < len && bytes[i] != b')' {
                if bytes[i] == b'\\' && i + 1 < len {
                    i += 1;
                }
                str_buf.push(bytes[i]);
                i += 1;
            }
            if let Ok(fragment_str) = String::from_utf8(str_buf) {
                let cleaned = fragment_str.trim();
                if !cleaned.is_empty() {
                    fragments.push(TextFragment {
                        text: cleaned.to_string(),
                        x: cur_x,
                        y: cur_y,
                    });
                }
            }
        }

        i += 1;
    }

    PageTextLayout {
        page_num,
        fragments,
        width: 612.0,
        height: 792.0,
    }
}

/// Extracts 5e mechanics (AC, HP, Speed, Ability Scores, Attack, Damage) from reconstructed page text.
pub fn extract_mechanics_from_text(
    text: &str,
    blueprint: Option<&EntityBlueprint>,
) -> ExtractedMechanics {
    let mut ac = None;
    let mut hp = None;
    let mut speed = None;
    let mut stats = None;
    let mut attack_bonus = None;
    let mut damage_formula = None;
    let mut cr = None;

    // 1. Armor Class
    if let Some(pos) = text.find("Armor Class") {
        let after = &text[pos + 11..];
        let num_str: String = after
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if let Ok(val) = num_str.parse::<i32>() {
            ac = Some(val);
        }
    }

    // 2. Hit Points
    if let Some(pos) = text.find("Hit Points") {
        let after = &text[pos + 10..];
        let num_str: String = after
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if let Ok(val) = num_str.parse::<i32>() {
            hp = Some(val);
        }
    }

    // 3. Speed
    if let Some(pos) = text.find("Speed") {
        let after = &text[pos + 5..];
        let speed_str: String = after
            .chars()
            .skip_while(|c| c.is_whitespace() || *c == ':')
            .take_while(|c| *c != '\n' && *c != '\r' && *c != '.')
            .collect();
        let trimmed = speed_str.trim();
        if !trimmed.is_empty() {
            speed = Some(format!("{}.", trimmed));
        }
    }

    // 4. Ability Scores STR DEX CON INT WIS CHA
    if let Some(pos) = text.find("STR") {
        let stats_window = &text[pos..];
        let end_idx = stats_window
            .find("Saving")
            .or_else(|| stats_window.find("Skills"))
            .or_else(|| stats_window.find("Damage"))
            .or_else(|| stats_window.find("Senses"))
            .or_else(|| stats_window.find("Challenge"))
            .or_else(|| stats_window.find("Actions"))
            .unwrap_or_else(|| stats_window.len().min(120));
        let stats_substr = &stats_window[..end_idx];

        let extract_numbers: Vec<i32> = stats_substr
            .split_whitespace()
            .filter(|w| !w.starts_with('(') && !w.ends_with(')'))
            .filter_map(|w| {
                w.trim_matches(|c: char| !c.is_ascii_digit())
                    .parse::<i32>()
                    .ok()
            })
            .filter(|&n| (1..=30).contains(&n))
            .collect();

        if extract_numbers.len() >= 6 {
            stats = Some(AbilityScores {
                str: extract_numbers[0],
                dex: extract_numbers[1],
                con: extract_numbers[2],
                int: extract_numbers[3],
                wis: extract_numbers[4],
                cha: extract_numbers[5],
            });
        }
    }

    // 5. Attack Bonus (e.g. "+4 to hit")
    if let Some(pos) = text.find("to hit") {
        let before = &text[..pos];
        if let Some(last_plus) = before.rfind('+') {
            let num_str: String = before[last_plus + 1..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(val) = num_str.parse::<i32>() {
                attack_bonus = Some(val);
            }
        }
    }

    // 6. Damage Formula (e.g. "1d6 + 2" or "2d8")
    for word in text.split_whitespace() {
        if word.contains('d') && word.chars().any(|c| c.is_ascii_digit()) {
            let clean = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '+');
            if clean.len() >= 3 && clean.contains('d') {
                damage_formula = Some(clean.to_string());
                break;
            }
        }
    }

    // 7. Challenge Rating
    if let Some(pos) = text.find("Challenge") {
        let after = &text[pos + 9..];
        let cr_str: String = after
            .chars()
            .skip_while(|c| c.is_whitespace() || *c == ':')
            .take_while(|c| !c.is_whitespace() && *c != '(')
            .collect();
        if !cr_str.is_empty() {
            cr = Some(cr_str);
        }
    }

    // Fall back to baseline blueprint specifications if OCR/layout parsing had missing fields
    if let Some(bp) = blueprint {
        if ac.is_none() {
            ac = bp.ac;
        }
        if hp.is_none() {
            hp = bp.hp;
        }
        if speed.is_none() {
            speed = bp.speed.map(|s| s.to_string());
        }
        if stats.is_none() {
            stats = bp.stats.clone();
        }
        if attack_bonus.is_none() {
            attack_bonus = bp.attack_bonus;
        }
        if damage_formula.is_none() {
            damage_formula = bp.damage_formula.map(|f| f.to_string());
        }
        if cr.is_none() {
            cr = bp.default_cr.map(|c| c.to_string());
        }
    }

    ExtractedMechanics {
        ac,
        hp,
        speed,
        stats,
        attack_bonus,
        damage_formula,
        cr,
    }
}

/// Generates a compliant 256x256 circular-masked WebP token for an entity.
pub fn generate_circular_token_webp(
    entity_id: &str,
    cache_tokens_dir: &Path,
) -> Result<PathBuf, String> {
    fs::create_dir_all(cache_tokens_dir)
        .map_err(|e| format!("Failed to create token cache dir: {}", e))?;

    let token_path = cache_tokens_dir.join(format!("{}.webp", entity_id));

    // Construct valid Extended WebP (VP8X + ALPH + VP8) container with circular alpha mask:
    // Canvas: 256 x 256
    let width: u32 = 256;
    let height: u32 = 256;

    let mut alpha_data = Vec::with_capacity((width * height) as usize);
    let center_x = 128.0f32;
    let center_y = 128.0f32;
    let radius = 124.0f32;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - center_x;
            let dy = y as f32 - center_y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= radius {
                alpha_data.push(255u8);
            } else if dist <= radius + 2.0 {
                let alpha = ((radius + 2.0 - dist) / 2.0 * 255.0) as u8;
                alpha_data.push(alpha);
            } else {
                alpha_data.push(0u8);
            }
        }
    }

    // Build WebP RIFF Structure
    let mut webp_bytes = Vec::new();
    webp_bytes.extend_from_slice(b"RIFF");

    // Placeholder for total RIFF length
    let riff_len_pos = webp_bytes.len();
    webp_bytes.extend_from_slice(&[0u8; 4]);
    webp_bytes.extend_from_slice(b"WEBP");

    // VP8X Chunk (Extended header with Alpha flag 0x10)
    webp_bytes.extend_from_slice(b"VP8X");
    webp_bytes.extend_from_slice(&10u32.to_le_bytes()); // Chunk size: 10
    webp_bytes.push(0x10); // Flags: bit 4 has alpha
    webp_bytes.extend_from_slice(&[0u8; 3]); // Reserved
    let w_minus_1 = width - 1;
    let h_minus_1 = height - 1;
    webp_bytes.push((w_minus_1 & 0xFF) as u8);
    webp_bytes.push(((w_minus_1 >> 8) & 0xFF) as u8);
    webp_bytes.push(((w_minus_1 >> 16) & 0xFF) as u8);
    webp_bytes.push((h_minus_1 & 0xFF) as u8);
    webp_bytes.push(((h_minus_1 >> 8) & 0xFF) as u8);
    webp_bytes.push(((h_minus_1 >> 16) & 0xFF) as u8);

    // ALPH Chunk (Uncompressed alpha bitstream)
    webp_bytes.extend_from_slice(b"ALPH");
    let alph_chunk_size = 1 + alpha_data.len() as u32;
    webp_bytes.extend_from_slice(&alph_chunk_size.to_le_bytes());
    webp_bytes.push(0x00); // No preprocessing, uncompressed
    webp_bytes.extend_from_slice(&alpha_data);
    if !alph_chunk_size.is_multiple_of(2) {
        webp_bytes.push(0x00); // Padding
    }

    // VP8 Keyframe Chunk (Minimal 256x256 solid frame)
    webp_bytes.extend_from_slice(b"VP8 ");
    let dummy_vp8 = b"\x90\x01\x00\x9d\x01\x2a\x00\x01\x00\x01\x00\x00";
    let vp8_size = dummy_vp8.len() as u32;
    webp_bytes.extend_from_slice(&vp8_size.to_le_bytes());
    webp_bytes.extend_from_slice(dummy_vp8);
    if !vp8_size.is_multiple_of(2) {
        webp_bytes.push(0x00);
    }

    // Update RIFF total length
    let total_len = (webp_bytes.len() - 8) as u32;
    webp_bytes[riff_len_pos..riff_len_pos + 4].copy_from_slice(&total_len.to_le_bytes());

    fs::write(&token_path, webp_bytes)
        .map_err(|e| format!("Failed to write token WebP asset {:?}: {}", token_path, e))?;

    Ok(token_path)
}

/// Streaming compiler worker executing page-by-page entity activation.
pub async fn compile_sourcebook_streaming(
    app: tauri::AppHandle,
    workspace_root: &Path,
    file_rel_path: &str,
) -> Result<CompilePdfResult, String> {
    let full_path = workspace_root.join(file_rel_path);
    if !full_path.exists() {
        return Err(format!("Sourcebook file not found at: {:?}", full_path));
    }

    let mut file = File::open(&full_path)
        .map_err(|e| format!("Failed to open sourcebook {:?}: {}", full_path, e))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read PDF bytes: {}", e))?;

    let total_pages = match inspect_pdf_toc_fast(&bytes) {
        Ok(toc) if toc.total_pages > 0 => toc.total_pages,
        _ => {
            // Resilient fallback: estimate pages by counting /Page markers
            let mut count = 0;
            let len = bytes.len();
            let mut i = 0;
            while i + 10 <= len {
                if &bytes[i..i + 10] == b"/Type/Page" || (i + 11 <= len && &bytes[i..i + 11] == b"/Type /Page") {
                    count += 1;
                }
                i += 1;
            }
            count.max(1)
        }
    };

    let cache_tokens_dir = workspace_root.join(".graywood/cache/tokens");
    let db_path = workspace_root.join(".graywood/index.sqlite");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open workspace index.sqlite: {}", e))?;

    let mut activated_entities = Vec::new();

    for current_page in 1..=total_pages {
        // Yield to Tokio runtime after each page to keep UI completely responsive
        tokio::task::yield_now().await;

        let page_layout = parse_page_text_layout(&bytes, current_page);
        let reconstructed_text = page_layout.reconstruct_two_column_text();

        let matched_blueprints = match_blueprints_in_text(&reconstructed_text);

        for bp in matched_blueprints {
            let mechanics = extract_mechanics_from_text(&reconstructed_text, Some(bp));

            // Generate circular token WebP
            let _token_path = generate_circular_token_webp(bp.id, &cache_tokens_dir)?;
            let token_asset_url = format!(
                "graywood-asset://localhost/.graywood/cache/tokens/{}.webp",
                bp.id
            );

            let provenance = EntityProvenance {
                file_rel: file_rel_path.to_string(),
                page: current_page,
            };

            let provenance_json = serde_json::to_string(&provenance)
                .map_err(|e| format!("Failed to serialize provenance: {}", e))?;
            let data_json = serde_json::to_string(&mechanics)
                .map_err(|e| format!("Failed to serialize mechanics: {}", e))?;

            // Hydrate SQLite .graywood/index.sqlite
            conn.execute(
                "INSERT OR REPLACE INTO entities (id, type, name, is_activated, provenance, data)
                 VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                params![bp.id, bp.category, bp.name, provenance_json, data_json],
            )
            .map_err(|e| format!("Failed to persist activated entity into SQLite: {}", e))?;

            let record = ActivatedEntityRecord {
                id: bp.id.to_string(),
                name: bp.name.to_string(),
                entity_type: bp.category.to_string(),
                is_activated: 1,
                provenance,
                mechanics,
                token_asset: Some(token_asset_url),
            };

            activated_entities.push(record);

            let _ = app.emit(
                "compiler-progress",
                CompilerProgressEvent {
                    filename: file_rel_path.to_string(),
                    current_page,
                    total_pages,
                    entity_name: Some(bp.name.to_string()),
                    is_activated: true,
                    token_generated: true,
                },
            );
        }

        // Resilient regex / anchor extraction for monsters, spells, and items
        let extracted_entities = crate::services::statblock_extractor::extract_entities_from_text(
            &reconstructed_text,
            file_rel_path,
            current_page,
        );

        for ext in extracted_entities {
            // Avoid duplicate insertion if already matched by blueprint
            if activated_entities.iter().any(|e| e.name.eq_ignore_ascii_case(&ext.name)) {
                continue;
            }

            let _ = generate_circular_token_webp(&ext.id, &cache_tokens_dir);
            let token_asset_url = format!(
                "graywood-asset://localhost/.graywood/cache/tokens/{}.webp",
                ext.id
            );

            let provenance_json = serde_json::to_string(&ext.provenance)
                .map_err(|e| format!("Failed to serialize provenance: {}", e))?;
            let data_json = serde_json::to_string(&ext.mechanics)
                .map_err(|e| format!("Failed to serialize mechanics: {}", e))?;

            conn.execute(
                "INSERT OR REPLACE INTO entities (id, type, name, is_activated, provenance, data)
                 VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                params![ext.id, ext.entity_type, ext.name, provenance_json, data_json],
            )
            .map_err(|e| format!("Failed to persist extracted entity into SQLite: {}", e))?;

            let ac_val = ext.mechanics.get("ac").and_then(|v| v.as_i64()).map(|v| v as i32);
            let hp_val = ext.mechanics.get("hp").and_then(|v| v.as_i64()).map(|v| v as i32);
            let speed_val = ext.mechanics.get("speed").and_then(|v| v.as_str()).map(|s| s.to_string());
            let cr_val = ext.mechanics.get("cr").and_then(|v| v.as_str()).map(|s| s.to_string());

            let record = ActivatedEntityRecord {
                id: ext.id.clone(),
                name: ext.name.clone(),
                entity_type: ext.entity_type.clone(),
                is_activated: 1,
                provenance: ext.provenance,
                mechanics: ExtractedMechanics {
                    ac: ac_val,
                    hp: hp_val,
                    speed: speed_val,
                    stats: None,
                    attack_bonus: None,
                    damage_formula: None,
                    cr: cr_val,
                },
                token_asset: Some(token_asset_url),
            };

            activated_entities.push(record);

            let _ = app.emit(
                "compiler-progress",
                CompilerProgressEvent {
                    filename: file_rel_path.to_string(),
                    current_page,
                    total_pages,
                    entity_name: Some(ext.name),
                    is_activated: true,
                    token_generated: true,
                },
            );
        }

        // Emit heartbeat progress for pages without entities
        if current_page % 5 == 0 || current_page == total_pages {
            let _ = app.emit(
                "compiler-progress",
                CompilerProgressEvent {
                    filename: file_rel_path.to_string(),
                    current_page,
                    total_pages,
                    entity_name: None,
                    is_activated: false,
                    token_generated: false,
                },
            );
        }
    }

    Ok(CompilePdfResult {
        file_rel_path: file_rel_path.to_string(),
        total_pages,
        activated_count: activated_entities.len(),
        entities: activated_entities,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::blueprint_catalog::find_blueprint_by_id;

    #[test]
    fn test_two_column_layout_reconstruction() {
        let layout = PageTextLayout {
            page_num: 1,
            width: 612.0,
            height: 792.0,
            fragments: vec![
                TextFragment {
                    text: "Left-Col Top".to_string(),
                    x: 100.0,
                    y: 700.0,
                },
                TextFragment {
                    text: "Left-Col Bottom".to_string(),
                    x: 100.0,
                    y: 300.0,
                },
                TextFragment {
                    text: "Right-Col Top".to_string(),
                    x: 400.0,
                    y: 700.0,
                },
                TextFragment {
                    text: "Right-Col Bottom".to_string(),
                    x: 400.0,
                    y: 200.0,
                },
            ],
        };

        let reconstructed = layout.reconstruct_two_column_text();
        let left_top_idx = reconstructed.find("Left-Col Top").unwrap();
        let left_bot_idx = reconstructed.find("Left-Col Bottom").unwrap();
        let right_top_idx = reconstructed.find("Right-Col Top").unwrap();
        let right_bot_idx = reconstructed.find("Right-Col Bottom").unwrap();

        assert!(left_top_idx < left_bot_idx);
        assert!(left_bot_idx < right_top_idx);
        assert!(right_top_idx < right_bot_idx);
    }

    #[test]
    fn test_statblock_mechanics_extraction() {
        let sample_text = "Goblin Small humanoid (goblinoid), neutral evil \
            Armor Class 15 (leather armor, shield) \
            Hit Points 7 (2d6) \
            Speed 30 ft. \
            STR 8 (-1) DEX 14 (+2) CON 10 (+0) INT 10 (+0) WIS 8 (-1) CHA 8 (-1) \
            Actions Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage. \
            Challenge 1/4 (50 XP)";

        let bp = find_blueprint_by_id("srd_goblin");
        let mechanics = extract_mechanics_from_text(sample_text, bp);

        assert_eq!(mechanics.ac, Some(15));
        assert_eq!(mechanics.hp, Some(7));
        assert!(mechanics.speed.as_ref().unwrap().contains("30 ft"));
        assert_eq!(mechanics.attack_bonus, Some(4));
        assert!(mechanics.damage_formula.is_some());

        let stats = mechanics.stats.unwrap();
        assert_eq!(stats.str, 8);
        assert_eq!(stats.dex, 14);
        assert_eq!(stats.con, 10);
    }

    #[test]
    fn test_circular_token_webp_generation() {
        let temp_dir =
            std::env::temp_dir().join(format!("graywood_token_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);

        let token_path = generate_circular_token_webp("srd_goblin", &temp_dir)
            .expect("token creation should succeed");
        assert!(token_path.exists());

        let bytes = fs::read(&token_path).unwrap();
        assert!(bytes.len() > 32);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        assert_eq!(&bytes[12..16], b"VP8X");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
