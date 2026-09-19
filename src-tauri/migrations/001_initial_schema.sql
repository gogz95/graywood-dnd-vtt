-- 001_initial_schema.sql
-- SQLite DDL migration for Aleamos DM Desktop (Tauri 2 backend)

PRAGMA foreign_keys = ON;

-- 1. Characters & PIN Claim Table
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    pin CHAR(4) NOT NULL CHECK (length(pin) = 4),
    current_hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL CHECK (max_hp >= 0),
    temp_hp INTEGER NOT NULL DEFAULT 0 CHECK (temp_hp >= 0),
    hit_dice_current INTEGER NOT NULL CHECK (hit_dice_current >= 0),
    hit_dice_max INTEGER NOT NULL CHECK (hit_dice_max >= 0),
    base_ac INTEGER NOT NULL CHECK (base_ac >= 0),
    speed INTEGER NOT NULL CHECK (speed >= 0),
    passive_perception INTEGER NOT NULL CHECK (passive_perception >= 0),
    spell_slots_json TEXT NOT NULL DEFAULT '{}',
    inventory_json TEXT NOT NULL DEFAULT '[]',
    is_orb_sealed BOOLEAN NOT NULL DEFAULT 0 CHECK (is_orb_sealed IN (0, 1)),
    resurrection_sickness_penalty INTEGER NOT NULL DEFAULT 0 CHECK (resurrection_sickness_penalty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_characters_pin ON characters(pin);

-- 2. Inventory & Spoilage Table
CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY NOT NULL,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    weight_lbs REAL NOT NULL DEFAULT 0.0 CHECK (weight_lbs >= 0.0),
    current_rp INTEGER NOT NULL DEFAULT 0 CHECK (current_rp >= 0),
    max_rp INTEGER NOT NULL DEFAULT 0 CHECK (max_rp >= 0),
    is_preserved BOOLEAN NOT NULL DEFAULT 0 CHECK (is_preserved IN (0, 1)),
    harvest_timestamp BIGINT NULL,
    base_value_cp BIGINT NOT NULL DEFAULT 0 CHECK (base_value_cp >= 0),
    is_spoiled BOOLEAN NOT NULL DEFAULT 0 CHECK (is_spoiled IN (0, 1)),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_character_id ON inventory_items(character_id);
CREATE INDEX IF NOT EXISTS idx_inventory_spoilage ON inventory_items(is_preserved, is_spoiled, harvest_timestamp);

-- Trigger: Automatically spoil unpreserved harvest on insert if timestamp exceeds 86400 seconds (24h)
CREATE TRIGGER IF NOT EXISTS trg_inventory_check_spoilage_insert
AFTER INSERT ON inventory_items
FOR EACH ROW
WHEN NEW.is_preserved = 0
  AND NEW.is_spoiled = 0
  AND NEW.harvest_timestamp IS NOT NULL
  AND (strftime('%s', 'now') - NEW.harvest_timestamp) > 86400
BEGIN
    UPDATE inventory_items
    SET is_spoiled = 1,
        base_value_cp = NEW.base_value_cp / 2
    WHERE id = NEW.id;
END;

-- Trigger: Automatically spoil unpreserved harvest on update if timestamp exceeds 86400 seconds (24h)
CREATE TRIGGER IF NOT EXISTS trg_inventory_check_spoilage_update
AFTER UPDATE OF harvest_timestamp, is_preserved, is_spoiled ON inventory_items
FOR EACH ROW
WHEN NEW.is_preserved = 0
  AND NEW.is_spoiled = 0
  AND NEW.harvest_timestamp IS NOT NULL
  AND (strftime('%s', 'now') - NEW.harvest_timestamp) > 86400
BEGIN
    UPDATE inventory_items
    SET is_spoiled = 1,
        base_value_cp = NEW.base_value_cp / 2
    WHERE id = NEW.id;
END;

-- 3. Currency Pouches & Assay Ledger Tables
CREATE TABLE IF NOT EXISTS currency_pouches (
    character_id TEXT PRIMARY KEY NOT NULL,
    concord_sovereigns BIGINT NOT NULL DEFAULT 0 CHECK (concord_sovereigns >= 0),
    ay_modlahd_sun_disks BIGINT NOT NULL DEFAULT 0 CHECK (ay_modlahd_sun_disks >= 0),
    rucean_rings BIGINT NOT NULL DEFAULT 0 CHECK (rucean_rings >= 0),
    trade_bars BIGINT NOT NULL DEFAULT 0 CHECK (trade_bars >= 0),
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assay_ledger (
    id TEXT PRIMARY KEY NOT NULL,
    character_id TEXT NOT NULL,
    transaction_timestamp BIGINT NOT NULL,
    sun_disks_submitted BIGINT NOT NULL CHECK (sun_disks_submitted > 0),
    sovereigns_minted BIGINT NOT NULL CHECK (sovereigns_minted >= 0),
    assay_fee_retained BIGINT NOT NULL CHECK (assay_fee_retained >= 0),
    notes TEXT,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assay_ledger_character_id ON assay_ledger(character_id);
CREATE INDEX IF NOT EXISTS idx_assay_ledger_timestamp ON assay_ledger(transaction_timestamp);

-- 4. Stronghold / Bastion Facility Table
-- Wage logic: Skilled hirelings cost 200 cp/day (2 gp), unskilled cost 20 cp/day (2 sp).
-- Daily hireling wage is enforced directly in SQL via a stored generated column.
CREATE TABLE IF NOT EXISTS bastion_facilities (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    room_points INTEGER NOT NULL CHECK (room_points BETWEEN 1 AND 6),
    structural_hp INTEGER NOT NULL CHECK (structural_hp >= 0),
    max_hp INTEGER NOT NULL CHECK (max_hp > 0),
    skilled_hirelings INTEGER NOT NULL DEFAULT 0 CHECK (skilled_hirelings >= 0),
    unskilled_hirelings INTEGER NOT NULL DEFAULT 0 CHECK (unskilled_hirelings >= 0),
    facility_type TEXT NOT NULL,
    monthly_tax_gp INTEGER NOT NULL DEFAULT 0 CHECK (monthly_tax_gp >= 0),
    daily_hireling_wage_cp INTEGER GENERATED ALWAYS AS (
        (skilled_hirelings * 200) + (unskilled_hirelings * 20)
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_bastion_facilities_type ON bastion_facilities(facility_type);
