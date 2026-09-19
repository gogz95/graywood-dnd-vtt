use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ElementalEssence {
    pub id: String,
    pub name: String,
    pub category: String,
    pub tier: i32,
    pub ingredient_points: i32,
    pub weapon_bonus_dice: String,
    pub weapon_damage_type: String,
    pub armor_reduction_type: String,
    pub armor_damage_type: String,
    pub description: String,
}

impl ElementalEssence {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            category: row.get("category")?,
            tier: row.get("tier")?,
            ingredient_points: row.get("ingredient_points")?,
            weapon_bonus_dice: row.get("weapon_bonus_dice")?,
            weapon_damage_type: row.get("weapon_damage_type")?,
            armor_reduction_type: row.get("armor_reduction_type")?,
            armor_damage_type: row.get("armor_damage_type")?,
            description: row.get("description")?,
        })
    }

    pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, category, tier, ingredient_points, weapon_bonus_dice,
                    weapon_damage_type, armor_reduction_type, armor_damage_type, description
             FROM elemental_essences
             ORDER BY tier ASC, name ASC"
        )?;

        let iter = stmt.query_map([], |row| Self::from_row(row))?;
        let mut results = Vec::new();
        for item in iter {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, category, tier, ingredient_points, weapon_bonus_dice,
                    weapon_damage_type, armor_reduction_type, armor_damage_type, description
             FROM elemental_essences
             WHERE id = ?1"
        )?;

        stmt.query_row([id], |row| Self::from_row(row)).optional()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemSocket {
    pub id: String,
    pub item_id: String,
    pub socket_index: i32,
    pub slotted_essence_id: Option<String>,
    pub created_at: i64,
}

impl ItemSocket {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            item_id: row.get("item_id")?,
            socket_index: row.get("socket_index")?,
            slotted_essence_id: row.get("slotted_essence_id")?,
            created_at: row.get("created_at")?,
        })
    }

    pub fn get_sockets_for_item(conn: &Connection, item_id: &str) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, item_id, socket_index, slotted_essence_id, created_at
             FROM item_sockets
             WHERE item_id = ?1
             ORDER BY socket_index ASC"
        )?;

        let iter = stmt.query_map([item_id], |row| Self::from_row(row))?;
        let mut results = Vec::new();
        for item in iter {
            results.push(item?);
        }
        Ok(results)
    }

    pub fn set_socket_essence(
        conn: &Connection,
        item_id: &str,
        socket_index: i32,
        essence_id: Option<&str>,
    ) -> rusqlite::Result<Self> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let socket_id = format!("sock-{}-{}", item_id, socket_index);

        conn.execute(
            "INSERT INTO item_sockets (id, item_id, socket_index, slotted_essence_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(item_id, socket_index) DO UPDATE SET
                slotted_essence_id = excluded.slotted_essence_id",
            params![socket_id, item_id, socket_index, essence_id, now],
        )?;

        Ok(Self {
            id: socket_id,
            item_id: item_id.to_string(),
            socket_index,
            slotted_essence_id: essence_id.map(|s| s.to_string()),
            created_at: now,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CraftingEvaluation {
    pub total_ingredient_points: i32,
    pub is_stable: bool,
    pub requires_alchemical_lab: bool,
    pub volatility_risk_percent: u32,
    pub projected_weapon_damage_bonuses: Vec<String>,
    pub projected_armor_reductions: Vec<String>,
    pub summary_message: String,
}

/// Evaluates the ingredient-point formula and facility stability requirements.
/// Formula: 10 points for the 1st ingredient, 15 points for each additional ingredient.
/// Breaches exceeding 25 total ingredient points require an owned Stronghold Alchemical Laboratory facility.
pub fn evaluate_crafting_matrix(
    essences: &[ElementalEssence],
    has_alchemical_lab: bool,
) -> CraftingEvaluation {
    let count = essences.len();

    let total_ingredient_points = if count == 0 {
        0
    } else {
        10 + (count as i32 - 1) * 15
    };

    let requires_alchemical_lab = total_ingredient_points > 25;

    let (is_stable, volatility_risk_percent) = if requires_alchemical_lab {
        if has_alchemical_lab {
            (true, 0)
        } else {
            let excess = total_ingredient_points - 25;
            let risk = (excess as u32 * 10).min(100);
            (false, risk)
        }
    } else {
        (true, 0)
    };

    let mut projected_weapon_damage_bonuses = Vec::new();
    let mut projected_armor_reductions = Vec::new();

    for essence in essences {
        projected_weapon_damage_bonuses.push(format!(
            "+{} {} damage",
            essence.weapon_bonus_dice, essence.weapon_damage_type
        ));

        let reduction_desc = if essence.armor_reduction_type == "PB" {
            format!("PB Reduction against {} damage", essence.armor_damage_type)
        } else {
            format!("Resistance to {} damage", essence.armor_damage_type)
        };
        projected_armor_reductions.push(reduction_desc);
    }

    let summary_message = if count == 0 {
        "Empty matrix: No elemental essences slotted.".to_string()
    } else if !is_stable {
        format!(
            "CRITICAL INSTABILITY ({} pts): Exceeds 25 ingredient points without an active Stronghold Alchemical Laboratory! {}% Volatility Failure Risk.",
            total_ingredient_points, volatility_risk_percent
        )
    } else if requires_alchemical_lab {
        format!(
            "Complex Matrix Stable ({} pts): Sustained by Stronghold Alchemical Laboratory facility containment.",
            total_ingredient_points
        )
    } else {
        format!(
            "Matrix Stable ({} pts): Well within standard ambient containment threshold.",
            total_ingredient_points
        )
    };

    CraftingEvaluation {
        total_ingredient_points,
        is_stable,
        requires_alchemical_lab,
        volatility_risk_percent,
        projected_weapon_damage_bonuses,
        projected_armor_reductions,
        summary_message,
    }
}
