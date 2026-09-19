use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub pin: String,
    pub current_hp: i32,
    pub max_hp: i32,
    pub temp_hp: i32,
    pub hit_dice_current: i32,
    pub hit_dice_max: i32,
    pub base_ac: i32,
    pub speed: i32,
    pub passive_perception: i32,
    pub spell_slots_json: String,
    pub inventory_json: String,
    pub is_orb_sealed: bool,
    pub resurrection_sickness_penalty: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SpellSlotLevel {
    pub max: u8,
    pub used: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SpellSlots {
    pub level_1: SpellSlotLevel,
    pub level_2: SpellSlotLevel,
    pub level_3: SpellSlotLevel,
    pub level_4: SpellSlotLevel,
    pub level_5: SpellSlotLevel,
    pub level_6: SpellSlotLevel,
    pub level_7: SpellSlotLevel,
    pub level_8: SpellSlotLevel,
    pub level_9: SpellSlotLevel,
}

impl Character {
    pub fn validate_pin(pin: &str) -> bool {
        pin.len() == 4 && pin.chars().all(|c| c.is_ascii_digit())
    }

    pub fn parse_spell_slots(&self) -> Result<SpellSlots, serde_json::Error> {
        if self.spell_slots_json.trim().is_empty() || self.spell_slots_json == "{}" {
            Ok(SpellSlots::default())
        } else {
            serde_json::from_str(&self.spell_slots_json)
        }
    }

    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let is_orb_sealed_int: i32 = row.get("is_orb_sealed")?;
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            pin: row.get("pin")?,
            current_hp: row.get("current_hp")?,
            max_hp: row.get("max_hp")?,
            temp_hp: row.get("temp_hp")?,
            hit_dice_current: row.get("hit_dice_current")?,
            hit_dice_max: row.get("hit_dice_max")?,
            base_ac: row.get("base_ac")?,
            speed: row.get("speed")?,
            passive_perception: row.get("passive_perception")?,
            spell_slots_json: row.get("spell_slots_json")?,
            inventory_json: row.get("inventory_json")?,
            is_orb_sealed: is_orb_sealed_int != 0,
            resurrection_sickness_penalty: row.get("resurrection_sickness_penalty")?,
        })
    }

    pub fn insert(&self, conn: &Connection) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO characters (
                id, name, pin, current_hp, max_hp, temp_hp,
                hit_dice_current, hit_dice_max, base_ac, speed,
                passive_perception, spell_slots_json, inventory_json,
                is_orb_sealed, resurrection_sickness_penalty
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                self.id,
                self.name,
                self.pin,
                self.current_hp,
                self.max_hp,
                self.temp_hp,
                self.hit_dice_current,
                self.hit_dice_max,
                self.base_ac,
                self.speed,
                self.passive_perception,
                self.spell_slots_json,
                self.inventory_json,
                if self.is_orb_sealed { 1 } else { 0 },
                self.resurrection_sickness_penalty,
            ],
        )?;
        Ok(())
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Self>> {
        conn.query_row(
            "SELECT id, name, pin, current_hp, max_hp, temp_hp,
                    hit_dice_current, hit_dice_max, base_ac, speed,
                    passive_perception, spell_slots_json, inventory_json,
                    is_orb_sealed, resurrection_sickness_penalty
             FROM characters WHERE id = ?1",
            params![id],
            Self::from_row,
        )
        .optional()
    }

    pub fn verify_pin(conn: &Connection, id: &str, candidate_pin: &str) -> rusqlite::Result<bool> {
        let stored_pin: Option<String> = conn
            .query_row(
                "SELECT pin FROM characters WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;

        match stored_pin {
            Some(pin) => Ok(pin == candidate_pin),
            None => Ok(false),
        }
    }
}
