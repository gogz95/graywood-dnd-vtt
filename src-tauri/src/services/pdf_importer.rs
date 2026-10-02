// src-tauri/src/services/pdf_importer.rs
// Headless Adventure PDF Text & Compendium Ingestion Engine (pdf-to-markdown pattern)

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedEncounter {
    pub name: String,
    pub count: usize,
    pub monster_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedChapter {
    pub title: String,
    pub content_markdown: String,
    pub section_type: String, // e.g. "Narrative", "Statblock", "Handout"
    pub encounters: Vec<ParsedEncounter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedStatblock {
    pub name: String,
    pub cr: String,
    pub ac: i32,
    pub hp: i32,
    pub raw_markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfImportReport {
    pub file_name: String,
    pub total_pages: usize,
    pub chapters: Vec<ParsedChapter>,
    pub statblocks: Vec<ParsedStatblock>,
    pub full_markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestPdfProgress {
    pub filename: String,
    pub status: String, // "starting" | "completed" | "timeout" | "error"
    pub count: usize,
    pub total: usize,
}

/// Headless extraction routine for PDF text streams.
/// Parses literal text blocks, escapes, and reconstructs structured 5e Markdown,
/// skipping binary image/font streams to prevent thread starvation.
pub fn parse_pdf_bytes(file_name: &str, bytes: &[u8]) -> Result<PdfImportReport, String> {
    if bytes.len() < 5 || &bytes[0..4] != b"%PDF" {
        return Err("Invalid file header: Not a valid PDF document".to_string());
    }

    let mut raw_strings = Vec::new();
    let mut in_text_block = false;
    let mut i = 0;
    let len = bytes.len();

    // Fast-scan stream tokens between BT and ET
    while i < len {
        // Fast-skip binary image/font streams to avoid evaluating millions of raster bytes
        if i + 6 <= len && &bytes[i..i + 6] == b"stream" {
            let lookback_start = i.saturating_sub(256);
            let header_context = &bytes[lookback_start..i];
            let is_binary_payload = header_context.windows(14).any(|w| w == b"/Subtype /Image")
                || header_context.windows(8).any(|w| w == b"/FontFile")
                || header_context.windows(10).any(|w| w == b"/DCTDecode")
                || header_context.windows(10).any(|w| w == b"/JPXDecode");

            if is_binary_payload {
                i += 6;
                // Jump straight past endstream
                if let Some(pos) = bytes[i..].windows(9).position(|w| w == b"endstream") {
                    i += pos + 9;
                    in_text_block = false;
                    continue;
                }
            }
        }

        // Match 'BT' (Begin Text)
        if i + 2 <= len
            && &bytes[i..i + 2] == b"BT"
            && (i == 0 || bytes[i - 1].is_ascii_whitespace())
        {
            in_text_block = true;
            i += 2;
            continue;
        }

        // Match 'ET' (End Text)
        if i + 2 <= len
            && &bytes[i..i + 2] == b"ET"
            && (i == 0 || bytes[i - 1].is_ascii_whitespace())
        {
            in_text_block = false;
            i += 2;
            continue;
        }

        if in_text_block {
            // String literal: ( ... )
            if bytes[i] == b'(' {
                i += 1;
                let mut current_str = Vec::with_capacity(64);
                let mut paren_depth = 1;
                let mut escape = false;
                let mut non_printable = 0;

                while i < len && paren_depth > 0 {
                    if current_str.len() > 2048 {
                        // String exceeds reasonable length, likely binary artifact
                        break;
                    }
                    let b = bytes[i];
                    if b < 0x09 || (b > 0x0D && b < 0x20 && b != 0x1B) {
                        non_printable += 1;
                        if non_printable > 8 {
                            in_text_block = false;
                            break;
                        }
                    }

                    if escape {
                        current_str.push(b);
                        escape = false;
                    } else if b == b'\\' {
                        escape = true;
                    } else if b == b'(' {
                        paren_depth += 1;
                        current_str.push(b);
                    } else if b == b')' {
                        paren_depth -= 1;
                        if paren_depth > 0 {
                            current_str.push(b);
                        }
                    } else {
                        current_str.push(b);
                    }
                    i += 1;
                }

                if let Ok(text) = String::from_utf8(current_str) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        raw_strings.push(trimmed.to_string());
                        if raw_strings.len() >= 40_000 {
                            break;
                        }
                    }
                }
                continue;
            }

            // Hex string literal: < ... >
            if bytes[i] == b'<' && i + 1 < len && bytes[i + 1] != b'<' {
                i += 1;
                let mut hex_bytes = Vec::new();
                while i < len && bytes[i] != b'>' {
                    if !bytes[i].is_ascii_whitespace() {
                        hex_bytes.push(bytes[i]);
                        if hex_bytes.len() > 2048 {
                            break;
                        }
                    }
                    i += 1;
                }
                if i < len && bytes[i] == b'>' {
                    i += 1;
                }

                if let Ok(hex_str) = std::str::from_utf8(&hex_bytes) {
                    if let Ok(decoded) = hex::decode(hex_str) {
                        if let Ok(text) = String::from_utf8(decoded) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                raw_strings.push(trimmed.to_string());
                                if raw_strings.len() >= 40_000 {
                                    break;
                                }
                            }
                        }
                    }
                }
                continue;
            }
        }

        i += 1;
    }

    // Reconstruct structural Markdown
    let mut chapters = Vec::new();
    let mut statblocks = Vec::new();
    let mut full_markdown = String::new();

    let mut current_chapter_title = "Prologue / Overview".to_string();
    let mut current_chapter_lines = Vec::new();

    let mut current_statblock: Option<ParsedStatblock> = None;

    let extract_encounters = |lines: &[String]| -> Vec<ParsedEncounter> {
        let mut encounters = Vec::new();
        // Common standard 5e monsters from 5e-database
        let monster_catalogs = [
            "Goblin",
            "Goblins",
            "Orc",
            "Orcs",
            "Skeleton",
            "Skeletons",
            "Zombie",
            "Zombies",
            "Kobold",
            "Kobolds",
            "Bandit",
            "Bandits",
            "Cultist",
            "Cultists",
            "Ghoul",
            "Ghouls",
            "Bugbear",
            "Bugbears",
            "Hobgoblin",
            "Hobgoblins",
            "Wolf",
            "Wolves",
            "Spider",
            "Giant Spider",
            "Ogre",
            "Ogres",
            "Troll",
            "Trolls",
            "Manticore",
            "Wraith",
            "Specter",
            "Shadow",
            "Shadows",
        ];

        for line in lines {
            // Fast pre-filter: line must contain digits to represent a count
            if !line.bytes().any(|b| b.is_ascii_digit()) {
                continue;
            }

            for mon in &monster_catalogs {
                if line.contains(mon) {
                    for word in line.split(|c: char| !c.is_alphanumeric()) {
                        if let Ok(count) = word.parse::<usize>() {
                            if count > 0 && count < 1000 {
                                let clean_name = mon.trim_end_matches('s').to_string();
                                let monster_id = clean_name.to_lowercase().replace(' ', "-");
                                if !encounters
                                    .iter()
                                    .any(|e: &ParsedEncounter| e.monster_id == monster_id)
                                {
                                    encounters.push(ParsedEncounter {
                                        name: clean_name,
                                        count: count.max(1),
                                        monster_id,
                                    });
                                }
                                break;
                            }
                        }
                    }
                }
            }
            if encounters.len() >= 50 {
                break;
            }
        }
        encounters
    };

    for line in raw_strings {
        let is_heading = line.starts_with("Chapter ")
            || line.starts_with("CHAPTER ")
            || line.starts_with("Part ")
            || line.starts_with("PART ")
            || line.starts_with("Act ")
            || (line.len() > 3
                && line.len() < 40
                && line
                    .chars()
                    .all(|c| c.is_uppercase() || c.is_whitespace() || c.is_ascii_punctuation()));

        if is_heading {
            if !current_chapter_lines.is_empty() {
                let encs = extract_encounters(&current_chapter_lines);
                chapters.push(ParsedChapter {
                    title: current_chapter_title.clone(),
                    content_markdown: current_chapter_lines.join("\n\n"),
                    section_type: "Narrative".to_string(),
                    encounters: encs,
                });
                current_chapter_lines.clear();
            }
            current_chapter_title = line.clone();
            full_markdown.push_str(&format!("\n\n## {}\n\n", line));
            continue;
        }

        // Detect 5e Monster Statblock markers
        if line.contains("Armor Class") && line.contains("Hit Points") {
            let sb = ParsedStatblock {
                name: current_chapter_title.clone(),
                cr: "1".to_string(),
                ac: 12,
                hp: 20,
                raw_markdown: format!(
                    "> ### {}\n> *Medium humanoid, unaligned*\n> ---\n> {}",
                    current_chapter_title, line
                ),
            };
            current_statblock = Some(sb);
        }

        if let Some(mut sb) = current_statblock.take() {
            sb.raw_markdown.push_str(&format!("\n> {}", line));
            statblocks.push(sb);
        }

        current_chapter_lines.push(line.clone());
        full_markdown.push_str(&line);
        full_markdown.push('\n');
    }

    if !current_chapter_lines.is_empty() {
        let encs = extract_encounters(&current_chapter_lines);
        chapters.push(ParsedChapter {
            title: current_chapter_title,
            content_markdown: current_chapter_lines.join("\n\n"),
            section_type: "Narrative".to_string(),
            encounters: encs,
        });
    }

    Ok(PdfImportReport {
        file_name: file_name.to_string(),
        total_pages: chapters.len().max(1),
        chapters,
        statblocks,
        full_markdown,
    })
}

/// Parses a single PDF file with an enforced 15-second timeout, panic catch-unwind,
/// and streaming progress emission to prevent backend and UI thread locks.
pub async fn parse_single_pdf_with_timeout(
    app: Option<&tauri::AppHandle>,
    file_path: &str,
    current: usize,
    total: usize,
) -> Result<PdfImportReport, String> {
    let path_buf = std::path::PathBuf::from(file_path);
    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let file_name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    let metadata = std::fs::metadata(&path_buf).ok();
    let size_kb = metadata.map(|m| m.len() / 1024).unwrap_or(0);

    eprintln!(
        "[PDF-INGEST] ({}/{}) Parsing {} ({} KB)...",
        current, total, file_name, size_kb
    );

    if let Some(handle) = app {
        use tauri::Emitter;
        let _ = handle.emit(
            "pdf-ingest-progress",
            IngestPdfProgress {
                filename: file_name.clone(),
                status: "starting".to_string(),
                count: current,
                total,
            },
        );
    }

    let f_name_clone = file_name.clone();
    let path_clone = path_buf.clone();

    // Enforce 15-second bounded execution timeout
    let timeout_duration = std::time::Duration::from_secs(15);

    let task = tokio::task::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut file = match File::open(&path_clone) {
                Ok(f) => f,
                Err(e) => return Err(format!("Failed to open file: {}", e)),
            };
            let mut bytes = Vec::new();
            if let Err(e) = file.read_to_end(&mut bytes) {
                return Err(format!("Failed to read file: {}", e));
            }
            parse_pdf_bytes(&f_name_clone, &bytes)
        }))
    });

    match tokio::time::timeout(timeout_duration, task).await {
        Ok(join_res) => match join_res {
            Ok(panic_res) => match panic_res {
                Ok(parse_res) => match parse_res {
                    Ok(report) => {
                        eprintln!(
                            "[PDF-INGEST] ({}/{}) Successfully parsed {} ({} chapters, {} statblocks)",
                            current,
                            total,
                            file_name,
                            report.chapters.len(),
                            report.statblocks.len()
                        );
                        if let Some(handle) = app {
                            use tauri::Emitter;
                            let _ = handle.emit(
                                "pdf-ingest-progress",
                                IngestPdfProgress {
                                    filename: file_name.clone(),
                                    status: "completed".to_string(),
                                    count: current,
                                    total,
                                },
                            );
                        }
                        Ok(report)
                    }
                    Err(e) => {
                        eprintln!("[PDF-WARN] Error parsing {}: {}", file_name, e);
                        if let Some(handle) = app {
                            use tauri::Emitter;
                            let _ = handle.emit(
                                "pdf-ingest-progress",
                                IngestPdfProgress {
                                    filename: file_name.clone(),
                                    status: "error".to_string(),
                                    count: current,
                                    total,
                                },
                            );
                        }
                        Err(e)
                    }
                },
                Err(_) => {
                    let err_msg = format!(
                        "Parser panicked on corrupted or malformed PDF: {}",
                        file_name
                    );
                    eprintln!("[PDF-WARN] {}", err_msg);
                    if let Some(handle) = app {
                        use tauri::Emitter;
                        let _ = handle.emit(
                            "pdf-ingest-progress",
                            IngestPdfProgress {
                                filename: file_name.clone(),
                                status: "error".to_string(),
                                count: current,
                                total,
                            },
                        );
                    }
                    Err(err_msg)
                }
            },
            Err(e) => {
                let err_msg = format!("Task join error for {}: {}", file_name, e);
                eprintln!("[PDF-WARN] {}", err_msg);
                Err(err_msg)
            }
        },
        Err(_) => {
            eprintln!(
                "[PDF-WARN] Timeout parsing {}, skipping deep extraction",
                file_name
            );
            if let Some(handle) = app {
                use tauri::Emitter;
                let _ = handle.emit(
                    "pdf-ingest-progress",
                    IngestPdfProgress {
                        filename: file_name.clone(),
                        status: "timeout".to_string(),
                        count: current,
                        total,
                    },
                );
            }
            Ok(PdfImportReport {
                file_name: file_name.clone(),
                total_pages: 1,
                chapters: vec![ParsedChapter {
                    title: format!("{} (Timed Out)", file_name),
                    content_markdown:
                        "PDF extraction exceeded 15s timeout limit and was safely skipped."
                            .to_string(),
                    section_type: "Overview".to_string(),
                    encounters: vec![],
                }],
                statblocks: vec![],
                full_markdown: format!("# {}\n\n*PDF extraction timed out after 15s.*", file_name),
            })
        }
    }
}

/// Tauri IPC command to ingest adventure PDF from filesystem with timeout guard
#[tauri::command]
pub async fn parse_adventure_pdf(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<PdfImportReport, String> {
    parse_single_pdf_with_timeout(Some(&app), &file_path, 1, 1).await
}

/// Tauri IPC command to ingest multiple adventure PDFs with non-blocking yields
#[tauri::command]
pub async fn parse_adventure_pdfs_batch(
    app: tauri::AppHandle,
    file_paths: Vec<String>,
) -> Result<Vec<PdfImportReport>, String> {
    let total = file_paths.len();
    let mut reports = Vec::new();
    for (idx, path) in file_paths.into_iter().enumerate() {
        let current = idx + 1;
        match parse_single_pdf_with_timeout(Some(&app), &path, current, total).await {
            Ok(report) => reports.push(report),
            Err(e) => eprintln!("[PDF-WARN] Skipping {}: {}", path, e),
        }
        tokio::task::yield_now().await;
    }
    Ok(reports)
}
