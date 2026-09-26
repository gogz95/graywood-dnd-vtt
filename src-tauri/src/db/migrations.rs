// src-tauri/src/db/migrations.rs
// Atomic schema migration runner tracking versions via PRAGMA user_version.
// Uses explicit BEGIN IMMEDIATE TRANSACTION and COMMIT with automated rollback on failure.

use rusqlite::Connection;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbMigrationError {
    #[error("SQLite error at version {version}: {source}")]
    Sqlite {
        version: u32,
        #[source]
        source: rusqlite::Error,
    },
    #[error("Transaction rollback failed: {0}")]
    RollbackFailed(#[source] rusqlite::Error),
    #[error("Failed to read user_version: {0}")]
    VersionReadFailed(#[source] rusqlite::Error),
    #[error("Failed to update user_version: {0}")]
    VersionUpdateFailed(#[source] rusqlite::Error),
}

pub struct MigrationStep {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[MigrationStep] = &[
    MigrationStep {
        version: 1,
        name: "001_baseline_campaign_scenes_and_entities",
        sql: r#"
            -- Campaign Settings Table
            CREATE TABLE IF NOT EXISTS campaign_settings (
                id TEXT PRIMARY KEY NOT NULL,
                dice_policy TEXT NOT NULL DEFAULT 'open',
                data_json TEXT NOT NULL DEFAULT '{}'
            );

            -- Scenes Table
            CREATE TABLE IF NOT EXISTS scenes (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                asset_path TEXT NOT NULL DEFAULT '',
                grid_type TEXT NOT NULL DEFAULT 'square',
                grid_size REAL NOT NULL DEFAULT 100.0
            );

            -- Core Characters & PIN Claim Table
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

            -- Inventory & Spoilage Table
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

            -- Currency Pouches
            CREATE TABLE IF NOT EXISTS currency_pouches (
                character_id TEXT PRIMARY KEY NOT NULL,
                concord_sovereigns BIGINT NOT NULL DEFAULT 0 CHECK (concord_sovereigns >= 0),
                ay_modlahd_sun_disks BIGINT NOT NULL DEFAULT 0 CHECK (ay_modlahd_sun_disks >= 0),
                rucean_rings BIGINT NOT NULL DEFAULT 0 CHECK (rucean_rings >= 0),
                trade_bars BIGINT NOT NULL DEFAULT 0 CHECK (trade_bars >= 0),
                updated_at BIGINT NOT NULL,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            );

            -- Assay Ledger
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

            -- Bastion Facilities
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
        "#,
    },
    MigrationStep {
        version: 2,
        name: "002_compendium_and_token_tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS compendium_entities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                source_pack TEXT NOT NULL,
                is_custom INTEGER DEFAULT 0,
                data_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scene_tokens (
                instance_id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                entity_id TEXT,
                name TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                elevation REAL DEFAULT 0.0,
                size_cells INTEGER DEFAULT 1,
                system_data_json TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );
        "#,
    },
    MigrationStep {
        version: 3,
        name: "003_categorized_entities_and_lore_fts",
        sql: r#"
            CREATE TABLE IF NOT EXISTS campaign_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                grid_size INTEGER NOT NULL DEFAULT 60,
                data_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS wall_colliders (
                id TEXT PRIMARY KEY NOT NULL,
                map_id TEXT NOT NULL,
                x1 REAL NOT NULL,
                y1 REAL NOT NULL,
                x2 REAL NOT NULL,
                y2 REAL NOT NULL,
                blocks_light INTEGER NOT NULL DEFAULT 1,
                blocks_movement INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS tokens (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                x REAL NOT NULL DEFAULT 0.0,
                y REAL NOT NULL DEFAULT 0.0,
                data_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS bestiary (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                cr TEXT NOT NULL DEFAULT '0',
                size TEXT NOT NULL DEFAULT 'Medium',
                type TEXT NOT NULL DEFAULT 'humanoid',
                ac INTEGER NOT NULL DEFAULT 10,
                hp INTEGER NOT NULL DEFAULT 10,
                stats_json TEXT NOT NULL DEFAULT '{}',
                traits_json TEXT NOT NULL DEFAULT '[]',
                actions_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'SRD 5.1'
            );

            CREATE TABLE IF NOT EXISTS monsters (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                cr TEXT NOT NULL,
                size TEXT NOT NULL,
                type TEXT NOT NULL,
                ac INTEGER NOT NULL,
                hp INTEGER NOT NULL,
                stats_json TEXT NOT NULL DEFAULT '{}',
                traits_json TEXT NOT NULL DEFAULT '[]',
                actions_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'SRD 5.1'
            );

            CREATE TABLE IF NOT EXISTS spells (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                school TEXT NOT NULL,
                casting_time TEXT NOT NULL,
                range TEXT NOT NULL,
                duration TEXT NOT NULL,
                components TEXT NOT NULL,
                description_text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'SRD 5.1'
            );

            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                item_type TEXT NOT NULL,
                rarity TEXT NOT NULL DEFAULT 'Common',
                cost TEXT NOT NULL DEFAULT '0 gp',
                weight REAL NOT NULL DEFAULT 0.0,
                description_text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'SRD 5.1'
            );

            CREATE TABLE IF NOT EXISTS lore_documents (
                id TEXT PRIMARY KEY NOT NULL,
                document_title TEXT NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content_text TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                embedding_vector TEXT
            );

            CREATE TABLE IF NOT EXISTS lore_chunks (
                id TEXT PRIMARY KEY NOT NULL,
                document_title TEXT NOT NULL,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content_text TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                embedding_vector TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS lore_fts USING fts5(content_text, document_title);
        "#,
    },
];

/// Retrieves current schema version from PRAGMA user_version.
pub fn get_user_version(conn: &Connection) -> Result<u32, DbMigrationError> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(DbMigrationError::VersionReadFailed)
}

/// Sets the database schema version via PRAGMA user_version.
pub fn set_user_version(conn: &Connection, version: u32) -> Result<(), rusqlite::Error> {
    conn.execute(&format!("PRAGMA user_version = {}", version), [])?;
    Ok(())
}

/// Executes all pending migrations atomically using `BEGIN IMMEDIATE TRANSACTION;` and `COMMIT;`.
/// If any statement fails, the transaction is rolled back, the exact error logged,
/// and a typed `DbMigrationError` is returned.
pub fn run_atomic_migrations(
    conn: &mut Connection,
    migrations: &[MigrationStep],
) -> Result<u32, DbMigrationError> {
    let current_version = get_user_version(conn)?;
    let mut applied_count = 0;

    for migration in migrations {
        if migration.version <= current_version {
            continue;
        }

        // 1. Explicit BEGIN IMMEDIATE TRANSACTION to acquire exclusive write lock upfront
        conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")
            .map_err(|e| DbMigrationError::Sqlite {
                version: migration.version,
                source: e,
            })?;

        // 2. Execute migration DDL batch
        match conn.execute_batch(migration.sql) {
            Ok(()) => {
                // 3. Update PRAGMA user_version
                if let Err(e) = set_user_version(conn, migration.version) {
                    let _ = conn.execute_batch("ROLLBACK;");
                    return Err(DbMigrationError::VersionUpdateFailed(e));
                }

                // 4. Commit transaction
                if let Err(e) = conn.execute_batch("COMMIT;") {
                    let _ = conn.execute_batch("ROLLBACK;");
                    return Err(DbMigrationError::Sqlite {
                        version: migration.version,
                        source: e,
                    });
                }

                applied_count += 1;
            }
            Err(e) => {
                eprintln!(
                    "[MIGRATION ERROR] Migration v{} ('{}') failed: {}. Triggering ROLLBACK...",
                    migration.version, migration.name, e
                );

                if let Err(rollback_err) = conn.execute_batch("ROLLBACK;") {
                    eprintln!(
                        "[MIGRATION ERROR] ROLLBACK execution failed: {}",
                        rollback_err
                    );
                    return Err(DbMigrationError::RollbackFailed(rollback_err));
                }

                return Err(DbMigrationError::Sqlite {
                    version: migration.version,
                    source: e,
                });
            }
        }
    }

    Ok(applied_count)
}
