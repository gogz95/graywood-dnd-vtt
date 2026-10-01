// src-tauri/src/services/pdf_importer.rs
// Headless Adventure PDF Text & Compendium Ingestion Engine (pdf-to-markdown pattern)

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

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

/// Headless extraction routine for PDF text streams.
/// Parses literal text blocks, escapes, and reconstructs structured 5e Markdown.
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
                let mut current_str = Vec::new();
                let mut paren_depth = 1;
                let mut escape = false;

                while i < len && paren_depth > 0 {
                    let b = bytes[i];
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
            "Goblin", "Goblins", "Orc", "Orcs", "Skeleton", "Skeletons", "Zombie", "Zombies",
            "Kobold", "Kobolds", "Bandit", "Bandits", "Cultist", "Cultists", "Ghoul", "Ghouls",
            "Bugbear", "Bugbears", "Hobgoblin", "Hobgoblins", "Wolf", "Wolves", "Spider", "Giant Spider",
            "Ogre", "Ogres", "Troll", "Trolls", "Manticore", "Wraith", "Specter", "Shadow", "Shadows"
        ];

        for line in lines {
            for mon in &monster_catalogs {
                // Look for patterns like "3 Goblins", "4 Orcs", "a Goblin", "two Skeletons"
                for word in line.split(|c: char| !c.is_alphanumeric()) {
                    if let Ok(count) = word.parse::<usize>() {
                        if line.contains(mon) {
                            let clean_name = mon.trim_end_matches('s').to_string();
                            let monster_id = clean_name.to_lowercase().replace(' ', "-");
                            if !encounters.iter().any(|e: &ParsedEncounter| e.monster_id == monster_id) {
                                encounters.push(ParsedEncounter {
                                    name: clean_name,
                                    count: count.max(1),
                                    monster_id,
                                });
                            }
                        }
                    }
                }
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

/// Tauri IPC command to ingest adventure PDF from filesystem
#[tauri::command]
pub async fn parse_adventure_pdf(file_path: String) -> Result<PdfImportReport, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf");

    parse_pdf_bytes(file_name, &bytes)
}
