use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurrencyPouch {
    pub character_id: String,
    pub concord_sovereigns: i64,
    pub ay_modlahd_sun_disks: i64,
    pub rucean_rings: i64,
    pub trade_bars: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssayLedgerEntry {
    pub id: String,
    pub character_id: String,
    pub transaction_timestamp: i64,
    pub sun_disks_submitted: i64,
    pub sovereigns_minted: i64,
    pub assay_fee_retained: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConversionResult {
    pub sun_disks_converted: i64,
    pub sovereigns_minted: i64,
    pub assay_fee_retained: i64,
    pub updated_pouch: CurrencyPouch,
    pub ledger_entry: AssayLedgerEntry,
}

#[derive(Debug, thiserror::Error)]
pub enum ConversionError {
    #[error("Conversion amount must be strictly greater than 0, got {0}")]
    InvalidAmount(i64),
    #[error("Insufficient sun disks: requested {requested}, but only {available} available")]
    InsufficientFunds { requested: i64, available: i64 },
    #[error("Currency pouch for character '{0}' was not found")]
    PouchNotFound(String),
    #[error("Database error during assay conversion: {0}")]
    DatabaseError(#[from] rusqlite::Error),
}

/// Deterministically calculates minted sovereigns and assay fee.
/// Fee is 10%, sovereigns minted is input * 0.90 rounded down to the nearest integer.
/// The remainder (sun_disks - sovereigns_minted) is retained as the assay fee.
pub fn calculate_sun_disk_assay(sun_disks: i64) -> Result<(i64, i64), ConversionError> {
    if sun_disks <= 0 {
        return Err(ConversionError::InvalidAmount(sun_disks));
    }
    let sovereigns_minted = ((sun_disks as f64) * 0.90).floor() as i64;
    let assay_fee_retained = sun_disks - sovereigns_minted;
    Ok((sovereigns_minted, assay_fee_retained))
}

impl CurrencyPouch {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            character_id: row.get("character_id")?,
            concord_sovereigns: row.get("concord_sovereigns")?,
            ay_modlahd_sun_disks: row.get("ay_modlahd_sun_disks")?,
            rucean_rings: row.get("rucean_rings")?,
            trade_bars: row.get("trade_bars")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn insert_or_replace(&self, conn: &Connection) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO currency_pouches (
                character_id, concord_sovereigns, ay_modlahd_sun_disks,
                rucean_rings, trade_bars, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(character_id) DO UPDATE SET
                concord_sovereigns = excluded.concord_sovereigns,
                ay_modlahd_sun_disks = excluded.ay_modlahd_sun_disks,
                rucean_rings = excluded.rucean_rings,
                trade_bars = excluded.trade_bars,
                updated_at = excluded.updated_at",
            params![
                self.character_id,
                self.concord_sovereigns,
                self.ay_modlahd_sun_disks,
                self.rucean_rings,
                self.trade_bars,
                self.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn find_by_character_id(
        conn: &Connection,
        character_id: &str,
    ) -> rusqlite::Result<Option<Self>> {
        conn.query_row(
            "SELECT character_id, concord_sovereigns, ay_modlahd_sun_disks,
                    rucean_rings, trade_bars, updated_at
             FROM currency_pouches WHERE character_id = ?1",
            params![character_id],
            Self::from_row,
        )
        .optional()
    }

    /// Converts Ay Modlahd Sun Disks to Concord Sovereigns with an automatic 10% assay fee deduction.
    /// Executes within a single ACID transaction, updating the pouch and inserting an entry into assay_ledger.
    pub fn convert_sun_disks_to_sovereigns(
        conn: &mut Connection,
        character_id: &str,
        sun_disks_to_convert: i64,
        timestamp: i64,
        transaction_id: &str,
        notes: Option<String>,
    ) -> Result<ConversionResult, ConversionError> {
        let (sovereigns_minted, assay_fee_retained) =
            calculate_sun_disk_assay(sun_disks_to_convert)?;

        let tx = conn.transaction()?;

        let mut pouch = tx
            .query_row(
                "SELECT character_id, concord_sovereigns, ay_modlahd_sun_disks,
                        rucean_rings, trade_bars, updated_at
                 FROM currency_pouches WHERE character_id = ?1",
                params![character_id],
                CurrencyPouch::from_row,
            )
            .optional()?
            .ok_or_else(|| ConversionError::PouchNotFound(character_id.to_string()))?;

        if pouch.ay_modlahd_sun_disks < sun_disks_to_convert {
            return Err(ConversionError::InsufficientFunds {
                requested: sun_disks_to_convert,
                available: pouch.ay_modlahd_sun_disks,
            });
        }

        pouch.ay_modlahd_sun_disks -= sun_disks_to_convert;
        pouch.concord_sovereigns += sovereigns_minted;
        pouch.updated_at = timestamp;

        tx.execute(
            "UPDATE currency_pouches
             SET concord_sovereigns = ?1,
                 ay_modlahd_sun_disks = ?2,
                 updated_at = ?3
             WHERE character_id = ?4",
            params![
                pouch.concord_sovereigns,
                pouch.ay_modlahd_sun_disks,
                pouch.updated_at,
                pouch.character_id,
            ],
        )?;

        let ledger_entry = AssayLedgerEntry {
            id: transaction_id.to_string(),
            character_id: character_id.to_string(),
            transaction_timestamp: timestamp,
            sun_disks_submitted: sun_disks_to_convert,
            sovereigns_minted,
            assay_fee_retained,
            notes,
        };

        tx.execute(
            "INSERT INTO assay_ledger (
                id, character_id, transaction_timestamp,
                sun_disks_submitted, sovereigns_minted, assay_fee_retained, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                ledger_entry.id,
                ledger_entry.character_id,
                ledger_entry.transaction_timestamp,
                ledger_entry.sun_disks_submitted,
                ledger_entry.sovereigns_minted,
                ledger_entry.assay_fee_retained,
                ledger_entry.notes,
            ],
        )?;

        tx.commit()?;

        Ok(ConversionResult {
            sun_disks_converted: sun_disks_to_convert,
            sovereigns_minted,
            assay_fee_retained,
            updated_pouch: pouch,
            ledger_entry,
        })
    }
}

impl AssayLedgerEntry {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            character_id: row.get("character_id")?,
            transaction_timestamp: row.get("transaction_timestamp")?,
            sun_disks_submitted: row.get("sun_disks_submitted")?,
            sovereigns_minted: row.get("sovereigns_minted")?,
            assay_fee_retained: row.get("assay_fee_retained")?,
            notes: row.get("notes")?,
        })
    }

    pub fn find_by_character_id(
        conn: &Connection,
        character_id: &str,
    ) -> rusqlite::Result<Vec<Self>> {
        let mut stmt = conn.prepare(
            "SELECT id, character_id, transaction_timestamp,
                    sun_disks_submitted, sovereigns_minted, assay_fee_retained, notes
             FROM assay_ledger
             WHERE character_id = ?1
             ORDER BY transaction_timestamp DESC",
        )?;
        let rows = stmt.query_map(params![character_id], Self::from_row)?;
        let mut entries = Vec::new();
        for entry in rows {
            entries.push(entry?);
        }
        Ok(entries)
    }
}
