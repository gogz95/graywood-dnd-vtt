// src-tauri/src/extractor.rs
// Native PDF Stream Decompressor & Page Text Layout Extractor
// Decompresses FlateDecode (zlib) streams using flate2 and parses PDF text operators (BT, ET, Tj, TJ, Tm, Td).

use flate2::read::ZlibDecoder;
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRecord {
    pub page_number: u32,
    pub raw_text: String,
    pub headings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedPdfDocument {
    pub total_pages: u32,
    pub pages: Vec<PageRecord>,
}

/// Decompresses raw FlateDecode bytes using flate2 ZlibDecoder.
pub fn decompress_flate_stream(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("FlateDecode zlib decompression failed: {}", e))?;
    Ok(decompressed)
}

/// Parses PDF text fragments and strings out of decompressed or raw stream bytes.
/// Handles (literal strings) with escapes and TJ array kerning blocks: [(text) -20 (more)].
/// Respects font matrix transformations (Tm) and text offset updates (Td/TD).
pub fn parse_stream_text_content(stream_bytes: &[u8]) -> String {
    let mut text_lines: Vec<String> = Vec::new();
    let mut current_line = String::new();
    let mut in_text = false;
    let len = stream_bytes.len();
    let mut i = 0;

    let mut last_y: f32 = 0.0;
    let mut cur_y: f32 = 0.0;

    while i < len {
        // Track Text Matrix Tm: [a b c d e f Tm] -> e=x, f=y
        if i + 3 <= len && &stream_bytes[i..i + 3] == b" Tm" {
            let start = i.saturating_sub(64);
            let slice = &stream_bytes[start..i];
            if let Ok(text) = std::str::from_utf8(slice) {
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() >= 6 {
                    let p_len = parts.len();
                    if let Ok(y) = parts[p_len - 1].parse::<f32>() {
                        cur_y = y;
                        if (cur_y - last_y).abs() > 4.0 && !current_line.trim().is_empty() {
                            text_lines.push(current_line.trim().to_string());
                            current_line.clear();
                            last_y = cur_y;
                        }
                    }
                }
            }
        }

        // Track Td / TD relative text positioning
        if i + 3 <= len && (&stream_bytes[i..i + 3] == b" Td" || &stream_bytes[i..i + 3] == b" TD") {
            let start = i.saturating_sub(32);
            let slice = &stream_bytes[start..i];
            if let Ok(text) = std::str::from_utf8(slice) {
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() >= 2 {
                    let p_len = parts.len();
                    if let Ok(dy) = parts[p_len - 1].parse::<f32>() {
                        cur_y += dy;
                        if dy.abs() > 4.0 && !current_line.trim().is_empty() {
                            text_lines.push(current_line.trim().to_string());
                            current_line.clear();
                            last_y = cur_y;
                        }
                    }
                }
            }
        }

        // T* moves to the start of the next line
        if i + 2 <= len && &stream_bytes[i..i + 2] == b"T*" {
            if !current_line.trim().is_empty() {
                text_lines.push(current_line.trim().to_string());
                current_line.clear();
            }
            i += 2;
            continue;
        }

        // BT: Begin Text
        if i + 2 <= len
            && &stream_bytes[i..i + 2] == b"BT"
            && (i == 0 || stream_bytes[i - 1].is_ascii_whitespace())
        {
            in_text = true;
            i += 2;
            continue;
        }

        // ET: End Text
        if i + 2 <= len
            && &stream_bytes[i..i + 2] == b"ET"
            && (i == 0 || stream_bytes[i - 1].is_ascii_whitespace())
        {
            in_text = false;
            if !current_line.trim().is_empty() {
                text_lines.push(current_line.trim().to_string());
                current_line.clear();
            }
            i += 2;
            continue;
        }

        if in_text {
            // TJ array operator: [(Frag 1) 20 (Frag 2)] TJ
            if stream_bytes[i] == b'[' {
                i += 1;
                while i < len && stream_bytes[i] != b']' {
                    if stream_bytes[i] == b'(' {
                        i += 1;
                        let mut str_buf = Vec::new();
                        while i < len && stream_bytes[i] != b')' {
                            if stream_bytes[i] == b'\\' && i + 1 < len {
                                i += 1;
                            }
                            str_buf.push(stream_bytes[i]);
                            i += 1;
                        }
                        if let Ok(s) = String::from_utf8(str_buf) {
                            if !s.is_empty() {
                                current_line.push_str(&s);
                            }
                        }
                    }
                    i += 1;
                }
                if i < len && stream_bytes[i] == b']' {
                    i += 1;
                }
                continue;
            }

            // Tj string operator: (Hello World) Tj
            if stream_bytes[i] == b'(' {
                i += 1;
                let mut str_buf = Vec::new();
                let mut paren_depth = 1;
                while i < len && paren_depth > 0 {
                    let b = stream_bytes[i];
                    if b == b'\\' && i + 1 < len {
                        i += 1;
                        str_buf.push(stream_bytes[i]);
                    } else if b == b'(' {
                        paren_depth += 1;
                        str_buf.push(b);
                    } else if b == b')' {
                        paren_depth -= 1;
                        if paren_depth > 0 {
                            str_buf.push(b);
                        }
                    } else {
                        str_buf.push(b);
                    }
                    i += 1;
                }
                if let Ok(s) = String::from_utf8(str_buf) {
                    if !s.is_empty() {
                        if !current_line.is_empty() && !current_line.ends_with(' ') {
                            current_line.push(' ');
                        }
                        current_line.push_str(&s);
                    }
                }
                continue;
            }
        }

        i += 1;
    }

    if !current_line.trim().is_empty() {
        text_lines.push(current_line.trim().to_string());
    }

    text_lines.join("\n")
}

/// Discovers and decompress all content streams for each page in a PDF document buffer.
pub fn extract_pdf_pages_decompressed(pdf_bytes: &[u8]) -> ExtractedPdfDocument {
    let mut page_streams: Vec<Vec<u8>> = Vec::new();
    let len = pdf_bytes.len();
    let mut i = 0;

    // Fast-scan all stream...endstream blocks
    while i < len {
        if i + 6 <= len && &pdf_bytes[i..i + 6] == b"stream" {
            // Find end of stream marker line (stream\r\n or stream\n)
            let mut stream_start = i + 6;
            if stream_start < len && pdf_bytes[stream_start] == b'\r' {
                stream_start += 1;
            }
            if stream_start < len && pdf_bytes[stream_start] == b'\n' {
                stream_start += 1;
            }

            // Find matching endstream
            if let Some(pos) = pdf_bytes[stream_start..].windows(9).position(|w| w == b"endstream") {
                let stream_end = stream_start + pos;
                let stream_raw = &pdf_bytes[stream_start..stream_end];

                // Inspect stream dictionary preceding stream keyword
                let dict_start = i.saturating_sub(512);
                let dict_context = &pdf_bytes[dict_start..i];

                let is_flate = dict_context.windows(12).any(|w| w == b"/FlateDecode")
                    || dict_context.windows(3).any(|w| w == b"/Fl");
                let is_image = dict_context.windows(14).any(|w| w == b"/Subtype /Image")
                    || dict_context.windows(7).any(|w| w == b"/Subtype/Image");
                let is_font = dict_context.windows(9).any(|w| w == b"/FontFile");

                if !is_image && !is_font {
                    let decompressed = if is_flate {
                        decompress_flate_stream(stream_raw).unwrap_or_else(|_| stream_raw.to_vec())
                    } else {
                        stream_raw.to_vec()
                    };

                    // Only keep streams that contain PDF text operators
                    if decompressed.windows(2).any(|w| w == b"BT") || decompressed.windows(2).any(|w| w == b"Tj") {
                        page_streams.push(decompressed);
                    }
                }

                i = stream_end + 9;
                continue;
            }
        }
        i += 1;
    }

    // Determine estimated total page count from /Count or /Type /Page occurrences
    let mut total_pages = 0u32;
    for window in pdf_bytes.windows(11) {
        if window == b"/Type /Page" || window == b"/Type/Page" {
            total_pages += 1;
        }
    }
    if total_pages == 0 {
        total_pages = page_streams.len() as u32;
    }
    if total_pages == 0 {
        total_pages = 1;
    }

    let mut pages = Vec::new();

    if page_streams.is_empty() {
        // Fallback: raw scan of string literals in the whole document
        let raw = parse_stream_text_content(pdf_bytes);
        pages.push(PageRecord {
            page_number: 1,
            raw_text: raw,
            headings: vec!["Compendium Source".to_string()],
        });
    } else {
        // Map streams into pages
        let streams_per_page = (page_streams.len() as f32 / total_pages as f32).max(1.0) as usize;
        let mut stream_chunks = page_streams.chunks(streams_per_page);

        for page_idx in 1..=total_pages {
            let mut page_text_accum = String::new();
            if let Some(chunk) = stream_chunks.next() {
                for s in chunk {
                    let txt = parse_stream_text_content(s);
                    if !txt.is_empty() {
                        if !page_text_accum.is_empty() {
                            page_text_accum.push_str("\n\n");
                        }
                        page_text_accum.push_str(&txt);
                    }
                }
            }

            // Extract headings heuristics (lines that are short, title-cased, or capitalized)
            let mut headings = Vec::new();
            for line in page_text_accum.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty()
                    && trimmed.len() <= 40
                    && (trimmed.chars().all(|c| c.is_uppercase() || c.is_whitespace() || c.is_ascii_punctuation())
                        || (trimmed.starts_with('#') || trimmed.ends_with(':')))
                {
                    headings.push(trimmed.trim_start_matches('#').trim().to_string());
                }
            }

            pages.push(PageRecord {
                page_number: page_idx,
                raw_text: page_text_accum,
                headings,
            });
        }
    }

    ExtractedPdfDocument {
        total_pages,
        pages,
    }
}
