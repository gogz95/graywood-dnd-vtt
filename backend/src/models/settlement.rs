use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettlementProfile {
    pub id: String,
    pub name: String,
    pub region: String,
    pub population_count: i32,
    pub demographics_json: String,
    pub governance_title: String,
    pub governance_details: String,
    pub security_posture: String,
    pub precursor_under_ruins_json: String,
    pub economic_enforcement_json: String,
    pub municipal_laws_json: String,
    pub created_at: i64,
}

impl SettlementProfile {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            region: row.get("region")?,
            population_count: row.get("population_count")?,
            demographics_json: row.get("demographics_json")?,
            governance_title: row.get("governance_title")?,
            governance_details: row.get("governance_details")?,
            security_posture: row.get("security_posture")?,
            precursor_under_ruins_json: row.get("precursor_under_ruins_json")?,
            economic_enforcement_json: row.get("economic_enforcement_json")?,
            municipal_laws_json: row.get("municipal_laws_json")?,
            created_at: row.get("created_at")?,
        })
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, region, population_count, demographics_json,
                    governance_title, governance_details, security_posture,
                    precursor_under_ruins_json, economic_enforcement_json,
                    municipal_laws_json, created_at
             FROM settlement_profiles
             WHERE id = ?1",
        )?;

        stmt.query_row([id], Self::from_row).optional()
    }

    pub fn get_ostrava(conn: &Connection) -> rusqlite::Result<Option<Self>> {
        Self::find_by_id(conn, "settlement_ostrava")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettlementContract {
    pub id: String,
    pub settlement_id: String,
    pub title: String,
    pub category: String,
    pub target_location: String,
    pub description: String,
    pub reward_gold: i32,
    pub reward_rp: i32,
    pub min_level: i32,
    pub expiration_days: i32,
    pub is_completed: bool,
    pub created_at: i64,
}

impl SettlementContract {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let is_completed_int: i32 = row.get("is_completed")?;
        Ok(Self {
            id: row.get("id")?,
            settlement_id: row.get("settlement_id")?,
            title: row.get("title")?,
            category: row.get("category")?,
            target_location: row.get("target_location")?,
            description: row.get("description")?,
            reward_gold: row.get("reward_gold")?,
            reward_rp: row.get("reward_rp")?,
            min_level: row.get("min_level")?,
            expiration_days: row.get("expiration_days")?,
            is_completed: is_completed_int != 0,
            created_at: row.get("created_at")?,
        })
    }

    pub fn list_for_settlement(
        conn: &Connection,
        settlement_id: &str,
    ) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, settlement_id, title, category, target_location, description,
                    reward_gold, reward_rp, min_level, expiration_days, is_completed, created_at
             FROM settlement_contracts
             WHERE settlement_id = ?1
             ORDER BY min_level ASC, reward_gold DESC",
        )?;

        let iter = stmt.query_map([settlement_id], Self::from_row)?;
        let mut results = Vec::new();
        for item in iter {
            results.push(item?);
        }
        Ok(results)
    }
}
