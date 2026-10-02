// src-tauri/src/services/table_extractor.rs
// PDF table header regex scanner, numeric range parser, CSV/MD workspace table watcher & SQLite indexer.

use crate::services::blueprint_catalog::BLUEPRINT_CATALOG;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableEntry {
    pub range: [i32; 2],
    pub text: String,
    pub linked_entity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableProvenance {
    pub source_type: String, // "pdf" | "csv" | "markdown"
    pub source_file_rel: String,
    pub page_number: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollableTableRecord {
    pub id: String,
    pub name: String,
    pub formula: String,
    pub provenance: TableProvenance,
    pub entries: Vec<TableEntry>,
}

/// Links text in a table entry to a known 5e SRD entity ID if mentioned.
pub fn link_monster_entity(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for bp in BLUEPRINT_CATALOG {
        if bp.category == "monster" {
            let name_lower = bp.name.to_lowercase();
            // Match singular or simple plural
            if lower.contains(&name_lower)
                || lower.contains(&format!("{}s", name_lower))
                || lower.contains(&format!("{}es", name_lower))
            {
                return Some(bp.id.to_string());
            }
        }
    }
    None
}

/// Parses a dice range string: "01-05", "1-4", "20", "00" -> [min, max]
pub fn parse_dice_range(range_str: &str, max_dice: i32) -> Option<[i32; 2]> {
    let trimmed = range_str.trim().replace('–', "-").replace('—', "-");
    if trimmed.is_empty() {
        return None;
    }

    if trimmed == "00" {
        return Some([100, 100]);
    }

    if let Some(dash_idx) = trimmed.find('-') {
        let left_str = trimmed[..dash_idx].trim();
        let right_str = trimmed[dash_idx + 1..].trim();

        let left = if left_str == "00" {
            100
        } else {
            left_str.parse::<i32>().ok()?
        };
        let right = if right_str == "00" {
            100
        } else {
            right_str.parse::<i32>().ok()?
        };
        Some([left.min(right), left.max(right)])
    } else if let Ok(val) = trimmed.parse::<i32>() {
        let normalized = if val == 0 && max_dice == 100 {
            100
        } else {
            val
        };
        Some([normalized, normalized])
    } else {
        None
    }
}

/// Scans raw text lines for PDF table headers matching:
/// /^(?:d(?:4|6|8|10|12|20|100)|1d\d+)\s+([A-Za-z\s]+)/i
pub fn extract_tables_from_text(
    text: &str,
    source_file_rel: &str,
    page_number: usize,
) -> Vec<RollableTableRecord> {
    let mut tables = Vec::new();
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Check for table header: e.g. "d20 Forest Encounters" or "1d100 Wild Magic Surge"
        if let Some((formula, name)) = parse_table_header(line) {
            let max_dice = formula
                .trim_start_matches("1d")
                .trim_start_matches('d')
                .parse::<i32>()
                .unwrap_or(20);

            let mut entries = Vec::new();
            let mut j = i + 1;

            while j < lines.len() {
                let row_line = lines[j];

                // If next line looks like a new table header, stop current table
                if parse_table_header(row_line).is_some() {
                    break;
                }

                // Try parsing row: split by first space or tab or delimiter
                if let Some((range, row_text)) = parse_table_row(row_line, max_dice) {
                    let linked = link_monster_entity(&row_text);
                    entries.push(TableEntry {
                        range,
                        text: row_text,
                        linked_entity_id: linked,
                    });
                } else if !entries.is_empty() && (row_line.starts_with('#') || row_line.len() > 60)
                {
                    // Reached end of table section
                    break;
                }

                j += 1;
            }

            if !entries.is_empty() {
                let id = format!(
                    "tbl_{}_{}",
                    name.to_lowercase()
                        .replace(|c: char| !c.is_alphanumeric(), "_"),
                    page_number
                );

                tables.push(RollableTableRecord {
                    id,
                    name,
                    formula,
                    provenance: TableProvenance {
                        source_type: "pdf".to_string(),
                        source_file_rel: source_file_rel.to_string(),
                        page_number: Some(page_number),
                    },
                    entries,
                });

                i = j;
                continue;
            }
        }

        i += 1;
    }

    tables
}

fn parse_table_header(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    let lower = trimmed.to_lowercase();

    // Check header prefixes: d4, d6, d8, d10, d12, d20, d100, 1d...
    let prefixes = [
        "d100", "d20", "d12", "d10", "d8", "d6", "d4", "1d100", "1d20", "1d12", "1d10", "1d8",
        "1d6", "1d4",
    ];
    for p in prefixes {
        if lower.starts_with(p) {
            let after = trimmed[p.len()..].trim();
            if !after.is_empty() && after.chars().next().unwrap().is_alphabetic() {
                let title = after
                    .trim_start_matches(|c: char| !c.is_alphanumeric())
                    .to_string();
                let formula = if p.starts_with("1d") {
                    p.to_string()
                } else {
                    format!("1{}", p)
                };
                return Some((formula, title));
            }
        }
    }
    None
}

fn parse_table_row(line: &str, max_dice: i32) -> Option<([i32; 2], String)> {
    let parts: Vec<&str> = line
        .splitn(2, |c: char| c.is_whitespace() || c == '|' || c == '\t')
        .collect();
    if parts.len() < 2 {
        return None;
    }

    let range_str = parts[0].trim().trim_matches('|');
    let text_part = parts[1].trim().trim_matches('|').trim();

    if text_part.is_empty() {
        return None;
    }

    let range = parse_dice_range(range_str, max_dice)?;
    Some((range, text_part.to_string()))
}

/// Parses a CSV table from a file.
/// Expected format:
/// Range,Result
/// 1-4,2d4 Goblins
/// 5-8,1d6 Kobolds
pub fn parse_csv_table(path: &Path, file_rel: &str) -> Result<RollableTableRecord, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read CSV: {}", e))?;
    let lines: Vec<&str> = content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() < 2 {
        return Err("CSV file contains insufficient rows".to_string());
    }

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Custom Table");
    let name = file_stem.replace('_', " ");

    let mut entries = Vec::new();
    let mut max_val = 20;

    for line in &lines[1..] {
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() >= 2 {
            let range_str = cols[0].trim();
            let text = cols[1..].join(",").trim().to_string();
            if let Some(range) = parse_dice_range(range_str, 100) {
                max_val = max_val.max(range[1]);
                let linked = link_monster_entity(&text);
                entries.push(TableEntry {
                    range,
                    text,
                    linked_entity_id: linked,
                });
            }
        }
    }

    let formula = if max_val <= 6 {
        "1d6".to_string()
    } else if max_val <= 8 {
        "1d8".to_string()
    } else if max_val <= 10 {
        "1d10".to_string()
    } else if max_val <= 12 {
        "1d12".to_string()
    } else if max_val <= 20 {
        "1d20".to_string()
    } else {
        "1d100".to_string()
    };

    Ok(RollableTableRecord {
        id: format!("csv_{}", file_stem.to_lowercase()),
        name,
        formula,
        provenance: TableProvenance {
            source_type: "csv".to_string(),
            source_file_rel: file_rel.to_string(),
            page_number: None,
        },
        entries,
    })
}

/// Parses a Markdown table from a file.
/// Expected format:
/// # Encounter Table
/// | d20 | Result |
/// |---|---|
/// | 1-4 | 2d4 Goblins |
pub fn parse_markdown_table(path: &Path, file_rel: &str) -> Result<RollableTableRecord, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read MD: {}", e))?;
    let lines: Vec<&str> = content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Custom Table");
    let mut name = file_stem.replace('_', " ");

    for line in &lines {
        if line.starts_with("# ") {
            name = line[2..].trim().to_string();
            break;
        }
    }

    let mut entries = Vec::new();
    let mut max_val = 20;

    for line in &lines {
        if !line.contains('|') || line.contains("---") {
            continue;
        }

        let cells: Vec<&str> = line
            .split('|')
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .collect();

        if cells.len() >= 2 {
            let range_str = cells[0];
            let text = cells[1].to_string();
            if let Some(range) = parse_dice_range(range_str, 100) {
                max_val = max_val.max(range[1]);
                let linked = link_monster_entity(&text);
                entries.push(TableEntry {
                    range,
                    text,
                    linked_entity_id: linked,
                });
            }
        }
    }

    let formula = if max_val <= 6 {
        "1d6".to_string()
    } else if max_val <= 8 {
        "1d8".to_string()
    } else if max_val <= 10 {
        "1d10".to_string()
    } else if max_val <= 12 {
        "1d12".to_string()
    } else if max_val <= 20 {
        "1d20".to_string()
    } else {
        "1d100".to_string()
    };

    Ok(RollableTableRecord {
        id: format!("md_{}", file_stem.to_lowercase()),
        name,
        formula,
        provenance: TableProvenance {
            source_type: "markdown".to_string(),
            source_file_rel: file_rel.to_string(),
            page_number: None,
        },
        entries,
    })
}

/// Watches and scans `Tables/` in workspace root, parsing all CSV and MD files
/// and synchronizing rows into `.graywood/index.sqlite`.
pub fn scan_and_sync_workspace_tables(
    workspace_root: &Path,
) -> Result<Vec<RollableTableRecord>, String> {
    let tables_dir = workspace_root.join("Tables");
    if !tables_dir.exists() {
        let _ = fs::create_dir_all(&tables_dir);
    }

    let mut records = Vec::new();
    if let Ok(dir_entries) = fs::read_dir(&tables_dir) {
        for entry_res in dir_entries.flatten() {
            let p = entry_res.path();
            if p.is_file() {
                let rel = format!("Tables/{}", p.file_name().unwrap().to_string_lossy());
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    match ext.to_lowercase().as_str() {
                        "csv" => {
                            if let Ok(record) = parse_csv_table(&p, &rel) {
                                records.push(record);
                            }
                        }
                        "md" => {
                            if let Ok(record) = parse_markdown_table(&p, &rel) {
                                records.push(record);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Persist into SQLite
    let db_path = workspace_root.join(".graywood/index.sqlite");
    if db_path.exists() {
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open index.sqlite: {}", e))?;

        for rec in &records {
            let prov_json = serde_json::to_string(&rec.provenance).unwrap_or_default();
            let entries_json = serde_json::to_string(&rec.entries).unwrap_or_default();

            let _ = conn.execute(
                "INSERT OR REPLACE INTO rollable_tables (id, name, formula, provenance, entries)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![rec.id, rec.name, rec.formula, prov_json, entries_json],
            );
        }
    }

    Ok(records)
}

/// Reads all synchronized rollable tables from `.graywood/index.sqlite`.
pub fn read_all_tables_from_db(workspace_root: &Path) -> Result<Vec<RollableTableRecord>, String> {
    let db_path = workspace_root.join(".graywood/index.sqlite");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open index.sqlite: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, name, formula, provenance, entries FROM rollable_tables")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let formula: String = row.get(2)?;
            let prov_str: String = row.get(3)?;
            let entries_str: String = row.get(4)?;

            let provenance: TableProvenance =
                serde_json::from_str(&prov_str).unwrap_or(TableProvenance {
                    source_type: "database".to_string(),
                    source_file_rel: String::new(),
                    page_number: None,
                });

            let entries: Vec<TableEntry> = serde_json::from_str(&entries_str).unwrap_or_default();

            Ok(RollableTableRecord {
                id,
                name,
                formula,
                provenance,
                entries,
            })
        })
        .map_err(|e| format!("Failed to query rollable_tables: {}", e))?;

    let mut tables = Vec::new();
    for r in rows.flatten() {
        tables.push(r);
    }

    Ok(tables)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dice_range() {
        assert_eq!(parse_dice_range("01-05", 100), Some([1, 5]));
        assert_eq!(parse_dice_range("1-4", 20), Some([1, 4]));
        assert_eq!(parse_dice_range("20", 20), Some([20, 20]));
        assert_eq!(parse_dice_range("00", 100), Some([100, 100]));
    }

    #[test]
    fn test_extract_tables_from_text() {
        let sample = "Random Encounters\n\
            d20 Forest Hazards\n\
            1-4 2d4 Goblins lurking in bushes\n\
            5-8 1d6 Kobolds setting a trap\n\
            9-12 1 Owlbear hunting prey\n\
            13-20 Quiet forest trail\n";

        let tables = extract_tables_from_text(sample, "Sourcebooks/Adventures.pdf", 42);
        assert_eq!(tables.len(), 1);
        let tbl = &tables[0];
        assert_eq!(tbl.formula, "1d20");
        assert_eq!(tbl.entries.len(), 4);

        assert_eq!(tbl.entries[0].range, [1, 4]);
        assert_eq!(
            tbl.entries[0].linked_entity_id,
            Some("srd_goblin".to_string())
        );

        assert_eq!(tbl.entries[1].range, [5, 8]);
        assert_eq!(
            tbl.entries[1].linked_entity_id,
            Some("srd_kobold".to_string())
        );

        assert_eq!(tbl.entries[2].range, [9, 12]);
        assert_eq!(
            tbl.entries[2].linked_entity_id,
            Some("srd_owlbear".to_string())
        );
    }
}
