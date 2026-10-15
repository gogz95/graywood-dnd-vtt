// src-tauri/src/services/statblock_extractor.rs
// Resilient 5e Statblock, Spell, and Magic Item regex-equivalent extractor.
// Extracts structured entities from unstructured 5e sourcebook page text with provenance.

use crate::services::blueprint_catalog::AbilityScores;
use crate::services::pdf_compiler::EntityProvenance;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub id: String,
    pub name: String,
    pub entity_type: String, // "monster" | "spell" | "item"
    pub is_activated: i32,
    pub provenance: EntityProvenance,
    pub mechanics: serde_json::Value,
    pub token_asset: Option<String>,
}

const MONSTER_SIZES: &[&str] = &[
    "tiny", "small", "medium", "large", "huge", "gargantuan"
];

const MONSTER_TYPES: &[&str] = &[
    "aberration", "beast", "celestial", "construct", "dragon",
    "elemental", "fey", "fiend", "giant", "humanoid",
    "monstrosity", "ooze", "plant", "undead"
];

const SPELL_SCHOOLS: &[&str] = &[
    "abjuration", "conjuration", "divination", "enchantment",
    "evocation", "illusion", "necromancy", "transmutation"
];

/// Extracts monsters, spells, and items from page text.
pub fn extract_entities_from_text(
    text: &str,
    file_rel: &str,
    page_num: usize,
) -> Vec<ExtractedEntity> {
    let mut entities = Vec::new();
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).collect();

    // 1. Detect monsters: Look for Size + Type line anchor
    for (i, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        let starts_with_size = MONSTER_SIZES.iter().any(|&s| lower.starts_with(s));

        if starts_with_size && MONSTER_TYPES.iter().any(|&t| lower.contains(t)) {
            // Preceding non-empty line is likely the creature name
            let mut name = String::new();
            if i > 0 {
                for prev in lines[..i].iter().rev() {
                    if !prev.is_empty() && prev.len() < 50 && !prev.starts_with('#') {
                        name = prev.to_string();
                        break;
                    }
                }
            }

            if name.is_empty() {
                continue;
            }

            // Look ahead up to 40 lines for AC, HP, Speed, Stats, CR
            let window_end = (i + 40).min(lines.len());
            let context_block = lines[i..window_end].join("\n");

            let has_ac = context_block.contains("Armor Class") || context_block.contains("AC ");
            let has_hp = context_block.contains("Hit Points") || context_block.contains("HP ");

            if has_ac && has_hp {
                let monster_data = parse_monster_block(&name, &line, &context_block);
                let id = format!("ext_{}_{}", slugify(&name), page_num);

                entities.push(ExtractedEntity {
                    id,
                    name: clean_entity_name(&name),
                    entity_type: "monster".to_string(),
                    is_activated: 1,
                    provenance: EntityProvenance {
                        file_rel: file_rel.to_string(),
                        page: page_num,
                    },
                    mechanics: monster_data,
                    token_asset: None,
                });
            }
        }
    }

    // 2. Detect spells: Look for spell level / school line
    // e.g. "1st-level evocation", "cantrip evocation", "evocation cantrip", "3rd-level abjuration (ritual)"
    for (i, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        let is_spell_header = (lower.contains("cantrip") || lower.contains("-level"))
            && SPELL_SCHOOLS.iter().any(|&s| lower.contains(s));

        if is_spell_header {
            let mut name = String::new();
            if i > 0 {
                for prev in lines[..i].iter().rev() {
                    if !prev.is_empty() && prev.len() < 50 {
                        name = prev.to_string();
                        break;
                    }
                }
            }

            if name.is_empty() {
                continue;
            }

            let window_end = (i + 25).min(lines.len());
            let context_block = lines[i..window_end].join("\n");

            let has_casting = context_block.contains("Casting Time");
            let has_range = context_block.contains("Range");

            if has_casting || has_range {
                let spell_data = parse_spell_block(&name, &line, &context_block);
                let id = format!("spell_{}_{}", slugify(&name), page_num);

                entities.push(ExtractedEntity {
                    id,
                    name: clean_entity_name(&name),
                    entity_type: "spell".to_string(),
                    is_activated: 1,
                    provenance: EntityProvenance {
                        file_rel: file_rel.to_string(),
                        page: page_num,
                    },
                    mechanics: spell_data,
                    token_asset: None,
                });
            }
        }
    }

    // 3. Detect equipment / magic items
    // e.g., "Weapon (longsword), uncommon (requires attunement)"
    for (i, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        let is_item_header = (lower.starts_with("weapon (") || lower.starts_with("armor (")
            || lower.starts_with("wondrous item") || lower.starts_with("potion,") || lower.starts_with("ring,"))
            && (lower.contains("common") || lower.contains("uncommon") || lower.contains("rare") || lower.contains("very rare") || lower.contains("legendary") || lower.contains("artifact"));

        if is_item_header {
            let mut name = String::new();
            if i > 0 {
                for prev in lines[..i].iter().rev() {
                    if !prev.is_empty() && prev.len() < 50 {
                        name = prev.to_string();
                        break;
                    }
                }
            }

            if !name.is_empty() {
                let window_end = (i + 15).min(lines.len());
                let desc = lines[i + 1..window_end].join(" ");
                let id = format!("item_{}_{}", slugify(&name), page_num);

                entities.push(ExtractedEntity {
                    id,
                    name: clean_entity_name(&name),
                    entity_type: "item".to_string(),
                    is_activated: 1,
                    provenance: EntityProvenance {
                        file_rel: file_rel.to_string(),
                        page: page_num,
                    },
                    mechanics: serde_json::json!({
                        "name": clean_entity_name(&name),
                        "type": "Magic Item",
                        "rarity": extract_rarity(&line),
                        "description": desc,
                    }),
                    token_asset: None,
                });
            }
        }
    }

    entities
}

fn parse_monster_block(name: &str, type_line: &str, block: &str) -> serde_json::Value {
    let mut ac = None;
    let mut hp = None;
    let mut speed = None;
    let mut stats = None;
    let mut cr = None;

    if let Some(pos) = block.find("Armor Class") {
        let after = &block[pos + 11..];
        let num_str: String = after.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
        ac = num_str.parse::<i32>().ok();
    }

    if let Some(pos) = block.find("Hit Points") {
        let after = &block[pos + 10..];
        let num_str: String = after.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
        hp = num_str.parse::<i32>().ok();
    }

    if let Some(pos) = block.find("Speed") {
        let after = &block[pos + 5..];
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

    if let Some(pos) = block.find("STR") {
        let window = &block[pos..];
        let end_idx = window.find("Saving").or_else(|| window.find("Skills")).or_else(|| window.find("Damage")).or_else(|| window.find("Senses")).or_else(|| window.find("Challenge")).unwrap_or_else(|| window.len().min(120));
        let substr = &window[..end_idx];

        let extract_numbers: Vec<i32> = substr
            .split_whitespace()
            .filter(|w| !w.starts_with('(') && !w.ends_with(')'))
            .filter_map(|w| w.trim_matches(|c: char| !c.is_ascii_digit()).parse::<i32>().ok())
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

    if let Some(pos) = block.find("Challenge") {
        let after = &block[pos + 9..];
        let cr_str: String = after
            .chars()
            .skip_while(|c| c.is_whitespace() || *c == ':')
            .take_while(|c| !c.is_whitespace() && *c != '(')
            .collect();
        if !cr_str.is_empty() {
            cr = Some(cr_str);
        }
    }

    serde_json::json!({
        "name": clean_entity_name(name),
        "size_type": type_line,
        "ac": ac.unwrap_or(10),
        "hp": hp.unwrap_or(10),
        "speed": speed.unwrap_or_else(|| "30 ft.".to_string()),
        "stats": stats,
        "cr": cr.unwrap_or_else(|| "1".to_string()),
    })
}

fn parse_spell_block(name: &str, school_line: &str, block: &str) -> serde_json::Value {
    let lower_line = school_line.to_lowercase();
    let level = if lower_line.contains("cantrip") {
        0
    } else if let Some(idx) = lower_line.find("-level") {
        let prefix = &lower_line[..idx];
        if prefix.ends_with("1st") { 1 }
        else if prefix.ends_with("2nd") { 2 }
        else if prefix.ends_with("3rd") { 3 }
        else if prefix.ends_with("4th") { 4 }
        else if prefix.ends_with("5th") { 5 }
        else if prefix.ends_with("6th") { 6 }
        else if prefix.ends_with("7th") { 7 }
        else if prefix.ends_with("8th") { 8 }
        else if prefix.ends_with("9th") { 9 }
        else { 1 }
    } else {
        1
    };

    let school = SPELL_SCHOOLS
        .iter()
        .find(|&&s| lower_line.contains(s))
        .map(|&s| capitalize(s))
        .unwrap_or_else(|| "Evocation".to_string());

    let casting_time = extract_field_value(block, "Casting Time:");
    let range = extract_field_value(block, "Range:");
    let components = extract_field_value(block, "Components:");
    let duration = extract_field_value(block, "Duration:");

    serde_json::json!({
        "name": clean_entity_name(name),
        "level": level,
        "school": school,
        "castingTime": casting_time.unwrap_or_else(|| "1 action".to_string()),
        "range": range.unwrap_or_else(|| "60 feet".to_string()),
        "components": components.unwrap_or_else(|| "V, S".to_string()),
        "duration": duration.unwrap_or_else(|| "Instantaneous".to_string()),
        "description": block,
    })
}

fn extract_field_value(block: &str, field_label: &str) -> Option<String> {
    if let Some(pos) = block.find(field_label) {
        let after = &block[pos + field_label.len()..];
        let val: String = after.chars().skip_while(|c| c.is_whitespace()).take_while(|c| *c != '\n' && *c != '\r').collect();
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn extract_rarity(line: &str) -> String {
    let lower = line.to_lowercase();
    if lower.contains("very rare") { "Very Rare".to_string() }
    else if lower.contains("legendary") { "Legendary".to_string() }
    else if lower.contains("artifact") { "Artifact".to_string() }
    else if lower.contains("uncommon") { "Uncommon".to_string() }
    else if lower.contains("rare") { "Rare".to_string() }
    else { "Common".to_string() }
}

fn clean_entity_name(name: &str) -> String {
    name.trim_matches(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '\'')
        .trim()
        .to_string()
}

fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_monster_from_text() {
        let text = "Red Dragon Wyrmling\nMedium dragon, chaotic evil\nArmor Class 17 (natural armor)\nHit Points 75 (10d8 + 30)\nSpeed 30 ft., fly 60 ft.\nSTR 19 (+4) DEX 10 (+0) CON 17 (+3) INT 12 (+1) WIS 11 (+0) CHA 15 (+2)\nChallenge 4 (1,100 XP)\nBite. Melee Weapon Attack: +6 to hit";
        let entities = extract_entities_from_text(text, "test.pdf", 12);
        assert_eq!(entities.len(), 1);
        let m = &entities[0];
        assert_eq!(m.name, "Red Dragon Wyrmling");
        assert_eq!(m.entity_type, "monster");
        assert_eq!(m.mechanics["ac"], 17);
        assert_eq!(m.mechanics["hp"], 75);
    }

    #[test]
    fn test_extract_spell_from_text() {
        let text = "Fireball\n3rd-level evocation\nCasting Time: 1 action\nRange: 150 feet\nComponents: V, S, M\nDuration: Instantaneous\nA bright streak flashes...";
        let entities = extract_entities_from_text(text, "spells.pdf", 45);
        assert_eq!(entities.len(), 1);
        let s = &entities[0];
        assert_eq!(s.name, "Fireball");
        assert_eq!(s.entity_type, "spell");
        assert_eq!(s.mechanics["level"], 3);
        assert_eq!(s.mechanics["school"], "Evocation");
    }
}
