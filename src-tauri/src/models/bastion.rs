use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

pub const SKILLED_HIRELING_DAILY_WAGE_CP: i64 = 200; // 2 gp/day = 200 cp
pub const UNSKILLED_HIRELING_DAILY_WAGE_CP: i64 = 20; // 2 sp/day = 20 cp
pub const CP_PER_GP: i64 = 100;
pub const CP_PER_SP: i64 = 10;
pub const STANDARD_DND_MONTH_DAYS: u32 = 30;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BastionFacility {
    pub id: String,
    pub name: String,
    pub room_points: u8,
    pub structural_hp: i32,
    pub max_hp: i32,
    pub skilled_hirelings: u32,
    pub unskilled_hirelings: u32,
    pub facility_type: String,
    pub monthly_tax_gp: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum BastionValidationError {
    #[error("Room points must be between 1 and 6 inclusive, got {0}")]
    InvalidRoomPoints(u8),
    #[error("Max HP must be strictly positive, got {0}")]
    InvalidMaxHp(i32),
    #[error("Structural HP cannot be negative or exceed max HP ({max_hp}), got {structural_hp}")]
    InvalidStructuralHp { structural_hp: i32, max_hp: i32 },
}

impl BastionFacility {
    pub fn validate(&self) -> Result<(), BastionValidationError> {
        if !(1..=6).contains(&self.room_points) {
            return Err(BastionValidationError::InvalidRoomPoints(self.room_points));
        }
        if self.max_hp <= 0 {
            return Err(BastionValidationError::InvalidMaxHp(self.max_hp));
        }
        if self.structural_hp < 0 || self.structural_hp > self.max_hp {
            return Err(BastionValidationError::InvalidStructuralHp {
                structural_hp: self.structural_hp,
                max_hp: self.max_hp,
            });
        }
        Ok(())
    }

    /// Daily hireling wages calculated deterministically:
    /// Skilled hirelings at 200 cp/day (2 gp), unskilled hirelings at 20 cp/day (2 sp).
    pub fn daily_hireling_wage_cp(&self) -> i64 {
        (self.skilled_hirelings as i64 * SKILLED_HIRELING_DAILY_WAGE_CP)
            + (self.unskilled_hirelings as i64 * UNSKILLED_HIRELING_DAILY_WAGE_CP)
    }

    /// Standard Faerun tenday (10 days) hireling wage in copper pieces.
    pub fn tenday_hireling_wage_cp(&self) -> i64 {
        self.daily_hireling_wage_cp() * 10
    }

    /// Monthly hireling wage in copper pieces for a month of specified duration (default: 30 days).
    pub fn monthly_hireling_wage_cp(&self, days_in_month: u32) -> i64 {
        self.daily_hireling_wage_cp() * (days_in_month as i64)
    }

    /// Monthly facility tax converted to copper pieces (1 gp = 100 cp).
    pub fn monthly_tax_cp(&self) -> i64 {
        self.monthly_tax_gp * CP_PER_GP
    }

    /// Total monthly maintenance cost in copper pieces (wages + tax).
    pub fn monthly_total_maintenance_cp(&self, days_in_month: u32) -> i64 {
        self.monthly_hireling_wage_cp(days_in_month) + self.monthly_tax_cp()
    }

    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let room_points_i32: i32 = row.get("room_points")?;
        let skilled_i32: i32 = row.get("skilled_hirelings")?;
        let unskilled_i32: i32 = row.get("unskilled_hirelings")?;

        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            room_points: room_points_i32 as u8,
            structural_hp: row.get("structural_hp")?,
            max_hp: row.get("max_hp")?,
            skilled_hirelings: skilled_i32 as u32,
            unskilled_hirelings: unskilled_i32 as u32,
            facility_type: row.get("facility_type")?,
            monthly_tax_gp: row.get("monthly_tax_gp")?,
        })
    }

    pub fn insert(&self, conn: &Connection) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.validate()?;
        conn.execute(
            "INSERT INTO bastion_facilities (
                id, name, room_points, structural_hp, max_hp,
                skilled_hirelings, unskilled_hirelings, facility_type, monthly_tax_gp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                self.id,
                self.name,
                self.room_points as i32,
                self.structural_hp,
                self.max_hp,
                self.skilled_hirelings as i32,
                self.unskilled_hirelings as i32,
                self.facility_type,
                self.monthly_tax_gp,
            ],
        )?;
        Ok(())
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        conn.query_row(
            "SELECT id, name, room_points, structural_hp, max_hp,
                    skilled_hirelings, unskilled_hirelings, facility_type, monthly_tax_gp
             FROM bastion_facilities WHERE id = ?1",
            params![id],
            Self::from_row,
        )
        .optional()
    }

    pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, room_points, structural_hp, max_hp,
                    skilled_hirelings, unskilled_hirelings, facility_type, monthly_tax_gp
             FROM bastion_facilities ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], Self::from_row)?;
        let mut facilities = Vec::new();
        for fac in rows {
            facilities.push(fac?);
        }
        Ok(facilities)
    }

    /// Queries the SQLite stored generated column to compute total daily hireling wages across all facilities.
    pub fn query_total_daily_wages_all(conn: &Connection) -> rusqlite::Result<i64> {
        let total: Option<i64> = conn.query_row(
            "SELECT SUM(daily_hireling_wage_cp) FROM bastion_facilities",
            [],
            |row| row.get(0),
        )?;
        Ok(total.unwrap_or(0))
    }
}
