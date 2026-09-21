use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

pub const SPOILAGE_THRESHOLD_SECONDS: i64 = 86400; // 24 hours in seconds

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InventoryItem {
    pub id: String,
    pub character_id: String,
    pub name: String,
    pub quantity: i32,
    pub weight_lbs: f64,
    pub current_rp: i32,
    pub max_rp: i32,
    pub is_preserved: bool,
    pub harvest_timestamp: Option<i64>,
    pub base_value_cp: i64,
    pub is_spoiled: bool,
}

impl InventoryItem {
    pub fn is_eligible_for_spoilage(&self, current_epoch: i64) -> bool {
        if self.is_preserved || self.is_spoiled {
            return false;
        }
        match self.harvest_timestamp {
            Some(harvest_time) => (current_epoch - harvest_time) > SPOILAGE_THRESHOLD_SECONDS,
            None => false,
        }
    }

    pub fn apply_spoilage_in_memory(&mut self, current_epoch: i64) -> bool {
        if self.is_eligible_for_spoilage(current_epoch) {
            self.is_spoiled = true;
            self.base_value_cp /= 2;
            true
        } else {
            false
        }
    }

    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let is_preserved_int: i32 = row.get("is_preserved")?;
        let is_spoiled_int: i32 = row.get("is_spoiled")?;
        Ok(Self {
            id: row.get("id")?,
            character_id: row.get("character_id")?,
            name: row.get("name")?,
            quantity: row.get("quantity")?,
            weight_lbs: row.get("weight_lbs")?,
            current_rp: row.get("current_rp")?,
            max_rp: row.get("max_rp")?,
            is_preserved: is_preserved_int != 0,
            harvest_timestamp: row.get("harvest_timestamp")?,
            base_value_cp: row.get("base_value_cp")?,
            is_spoiled: is_spoiled_int != 0,
        })
    }

    pub fn insert(&self, conn: &Connection) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO inventory_items (
                id, character_id, name, quantity, weight_lbs,
                current_rp, max_rp, is_preserved, harvest_timestamp,
                base_value_cp, is_spoiled
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                self.id,
                self.character_id,
                self.name,
                self.quantity,
                self.weight_lbs,
                self.current_rp,
                self.max_rp,
                if self.is_preserved { 1 } else { 0 },
                self.harvest_timestamp,
                self.base_value_cp,
                if self.is_spoiled { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        conn.query_row(
            "SELECT id, character_id, name, quantity, weight_lbs,
                    current_rp, max_rp, is_preserved, harvest_timestamp,
                    base_value_cp, is_spoiled
             FROM inventory_items WHERE id = ?1",
            params![id],
            Self::from_row,
        )
        .optional()
    }

    pub fn find_by_character_id(
        conn: &Connection,
        character_id: &str,
    ) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, character_id, name, quantity, weight_lbs,
                    current_rp, max_rp, is_preserved, harvest_timestamp,
                    base_value_cp, is_spoiled
             FROM inventory_items WHERE character_id = ?1 ORDER BY name ASC",
        )?;
        let rows = stmt.query_map(params![character_id], Self::from_row)?;
        let mut items = Vec::new();
        for item_result in rows {
            items.push(item_result?);
        }
        Ok(items)
    }

    /// Complete deterministic query to identify unpreserved items where
    /// (current_epoch - harvest_timestamp) > 86400 seconds, setting is_spoiled = 1
    /// and halving base_value_cp. Returns the count of affected rows.
    pub fn apply_spoilage_batch(conn: &Connection, current_epoch: i64) -> rusqlite::Result<usize> {
        let affected = conn.execute(
            "UPDATE inventory_items
             SET is_spoiled = 1,
                 base_value_cp = base_value_cp / 2
             WHERE is_preserved = 0
               AND is_spoiled = 0
               AND harvest_timestamp IS NOT NULL
               AND (?1 - harvest_timestamp) > ?2",
            params![current_epoch, SPOILAGE_THRESHOLD_SECONDS],
        )?;
        Ok(affected)
    }

    /// Query to inspect unpreserved items that have spoiled or are due for spoilage
    pub fn find_items_due_for_spoilage(
        conn: &Connection,
        current_epoch: i64,
    ) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, character_id, name, quantity, weight_lbs,
                    current_rp, max_rp, is_preserved, harvest_timestamp,
                    base_value_cp, is_spoiled
             FROM inventory_items
             WHERE is_preserved = 0
               AND is_spoiled = 0
               AND harvest_timestamp IS NOT NULL
               AND (?1 - harvest_timestamp) > ?2",
        )?;
        let rows = stmt.query_map(
            params![current_epoch, SPOILAGE_THRESHOLD_SECONDS],
            Self::from_row,
        )?;
        let mut items = Vec::new();
        for item_result in rows {
            items.push(item_result?);
        }
        Ok(items)
    }
}
