use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompendiumClass {
    pub id: String,
    pub name: String,
    pub hit_die: i32,
    pub primary_ability: String,
    pub saving_throws_json: String,
    pub description: String,
    pub features_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompendiumSpell {
    pub id: String,
    pub name: String,
    pub level: i32,
    pub school: String,
    pub casting_time: String,
    pub range: String,
    pub components: String,
    pub duration: String,
    pub description: String,
    pub classes_json: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompendiumMonster {
    pub id: String,
    pub name: String,
    pub cr: f64,
    pub ac: i32,
    pub hp: i32,
    pub speed: i32,
    pub alignment: String,
    pub creature_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicCharacterRoster {
    pub id: String,
    pub name: String,
    pub is_orb_sealed: bool,
}

impl CompendiumClass {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            hit_die: row.get("hit_die")?,
            primary_ability: row.get("primary_ability")?,
            saving_throws_json: row.get("saving_throws_json")?,
            description: row.get("description")?,
            features_json: row.get("features_json")?,
        })
    }

    pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, hit_die, primary_ability, saving_throws_json, description, features_json
             FROM compendium_classes ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], Self::from_row)?;
        let mut classes = Vec::new();
        for item in rows {
            classes.push(item?);
        }
        Ok(classes)
    }
}

impl CompendiumSpell {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            level: row.get("level")?,
            school: row.get("school")?,
            casting_time: row.get("casting_time")?,
            range: row.get("range")?,
            components: row.get("components")?,
            duration: row.get("duration")?,
            description: row.get("description")?,
            classes_json: row.get("classes_json")?,
        })
    }

    /// Queries compendium spells with optional filtering by spell level and class.
    pub fn query_spells(
        conn: &Connection,
        level: Option<i32>,
        class: Option<&str>,
    ) -> rusqlite::Result<Vec<Self>> {
        match (level, class) {
            (Some(lvl), Some(cls)) => {
                let class_pattern = format!("%\"{}\"%", cls);
                let mut stmt = conn.prepare(
                    "SELECT id, name, level, school, casting_time, range, components, duration, description, classes_json
                     FROM compendium_spells
                     WHERE level = ?1 AND classes_json LIKE ?2
                     ORDER BY level ASC, name ASC",
                )?;
                let rows = stmt.query_map(params![lvl, class_pattern], Self::from_row)?;
                let mut spells = Vec::new();
                for s in rows {
                    spells.push(s?);
                }
                Ok(spells)
            }
            (Some(lvl), None) => {
                let mut stmt = conn.prepare(
                    "SELECT id, name, level, school, casting_time, range, components, duration, description, classes_json
                     FROM compendium_spells
                     WHERE level = ?1
                     ORDER BY name ASC",
                )?;
                let rows = stmt.query_map(params![lvl], Self::from_row)?;
                let mut spells = Vec::new();
                for s in rows {
                    spells.push(s?);
                }
                Ok(spells)
            }
            (None, Some(cls)) => {
                let class_pattern = format!("%\"{}\"%", cls);
                let mut stmt = conn.prepare(
                    "SELECT id, name, level, school, casting_time, range, components, duration, description, classes_json
                     FROM compendium_spells
                     WHERE classes_json LIKE ?1
                     ORDER BY level ASC, name ASC",
                )?;
                let rows = stmt.query_map(params![class_pattern], Self::from_row)?;
                let mut spells = Vec::new();
                for s in rows {
                    spells.push(s?);
                }
                Ok(spells)
            }
            (None, None) => {
                let mut stmt = conn.prepare(
                    "SELECT id, name, level, school, casting_time, range, components, duration, description, classes_json
                     FROM compendium_spells
                     ORDER BY level ASC, name ASC",
                )?;
                let rows = stmt.query_map([], Self::from_row)?;
                let mut spells = Vec::new();
                for s in rows {
                    spells.push(s?);
                }
                Ok(spells)
            }
        }
    }
}

impl PublicCharacterRoster {
    pub fn list_public_roster(conn: &Connection) -> rusqlite::Result<Vec<Self>> {
        let mut stmt =
            conn.prepare("SELECT id, name, is_orb_sealed FROM characters ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            let is_orb_sealed_int: i32 = row.get("is_orb_sealed")?;
            Ok(Self {
                id: row.get("id")?,
                name: row.get("name")?,
                is_orb_sealed: is_orb_sealed_int != 0,
            })
        })?;
        let mut roster = Vec::new();
        for item in rows {
            roster.push(item?);
        }
        Ok(roster)
    }
}
