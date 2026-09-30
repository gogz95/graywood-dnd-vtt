// src-tauri/tests/migration_test.rs
// Headless Integration Smoke Test for Clean-Slate SQLite Migrations
// Verifies sequential migration from revision 0 to latest, validates expected table schemas,
// and ensures proper WAL checkpoint teardown without orphan locks or corrupted headers.

use graywood_vtt_lib::db::{
    apply_wal_pragmas, configure_and_migrate, get_user_version, run_atomic_migrations,
    verify_and_recover_db, MIGRATIONS,
};
use rusqlite::Connection;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn test_clean_slate_migration_and_wal_teardown() {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let temp_db_path = std::env::temp_dir().join(format!("graywood_migration_smoke_{}.db", nanos));

    // Stage 1: Instantiate isolated temporary file-backed SQLite instance
    {
        let mut conn = Connection::open(&temp_db_path)
            .expect("Failed to create temporary SQLite database file");
        apply_wal_pragmas(&conn).expect("Failed to apply initial WAL pragmas");

        let initial_version =
            get_user_version(&conn).expect("Failed to query initial user_version");
        assert_eq!(
            initial_version, 0,
            "Clean database must start at user_version 0"
        );

        // Stage 2: Execute all pending migrations sequentially from revision 0 to latest
        let applied_count = run_atomic_migrations(&mut conn, MIGRATIONS)
            .expect("Failed executing atomic schema migrations");
        assert!(applied_count > 0, "Must apply all pending migrations");

        // Also run versioned migrations runner to ensure compatibility across both migration pathways
        let _ = configure_and_migrate(&mut conn)
            .expect("configure_and_migrate should succeed on initialized db");

        // Verify final user_version matches latest migration
        let latest_version = get_user_version(&conn).expect("Failed to read latest user_version");
        let expected_latest = MIGRATIONS.last().map(|m| m.version).unwrap_or(0);
        assert_eq!(
            latest_version, expected_latest,
            "user_version must match the highest migration revision"
        );

        // Stage 3: Assert tables exist with appropriate schemas
        let expected_tables = [
            "campaign_settings",
            "scenes",
            "characters",
            "inventory_items",
            "currency_pouches",
            "assay_ledger",
            "bastion_facilities",
            "compendium_entities",
            "scene_tokens",
            "campaign_meta",
            "maps",
            "wall_colliders",
            "tokens",
            "bestiary",
            "monsters",
            "spells",
            "items",
            "lore_documents",
            "lore_chunks",
            "lore_fts",
            "world_calendar",
            "map_pins",
            "campaign_fts",
            "schema_migrations",
            "contracts",
            "elemental_essences",
            "item_sockets",
            "settlement_profiles",
        ];

        for table in &expected_tables {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE (type='table' OR type='shadow' OR type='view') AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            assert!(
                exists,
                "Expected table or virtual table '{}' to exist after full migration",
                table
            );
        }

        // Verify FTS5 virtual tables can execute queries without error
        let lore_fts_count: i64 = conn
            .query_row("SELECT count(*) FROM lore_fts", [], |r| r.get(0))
            .expect("lore_fts must be queryable");
        assert!(
            lore_fts_count >= 0,
            "lore_fts should return non-negative row count"
        );

        let campaign_fts_count: i64 = conn
            .query_row("SELECT count(*) FROM campaign_fts", [], |r| r.get(0))
            .expect("campaign_fts must be queryable");
        assert!(
            campaign_fts_count >= 0,
            "campaign_fts should return non-negative row count"
        );

        // Flush and checkpoint WAL to disk prior to closing connection
        let _: Result<(i32, i32, i32), _> =
            conn.query_row("PRAGMA wal_checkpoint(TRUNCATE);", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            });
    }

    // Stage 4: Re-open sequence to confirm WAL journal tears down cleanly without orphan locks
    {
        let mut reopened_conn =
            Connection::open(&temp_db_path).expect("Failed to re-open temporary SQLite database");
        apply_wal_pragmas(&reopened_conn)
            .expect("Failed to re-apply WAL pragmas on re-opened database");

        // Verify integrity and auto-recovery succeeds with clean status
        verify_and_recover_db(&mut reopened_conn, Some(&temp_db_path))
            .expect("Auto-recovery and integrity check should pass cleanly on re-opened DB");

        let integrity_result: String = reopened_conn
            .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
            .expect("Integrity check query failed");
        assert_eq!(
            integrity_result, "ok",
            "Database integrity check must report 'ok'"
        );

        let final_version =
            get_user_version(&reopened_conn).expect("Failed reading user_version on re-opened DB");
        let expected_latest = MIGRATIONS.last().map(|m| m.version).unwrap_or(0);
        assert_eq!(
            final_version, expected_latest,
            "Version must persist accurately across re-open"
        );
    }

    // Clean up temporary database files
    let _ = std::fs::remove_file(&temp_db_path);
    let wal_path = temp_db_path.with_file_name(format!(
        "{}-wal",
        temp_db_path.file_name().unwrap().to_string_lossy()
    ));
    let shm_path = temp_db_path.with_file_name(format!(
        "{}-shm",
        temp_db_path.file_name().unwrap().to_string_lossy()
    ));
    let _ = std::fs::remove_file(wal_path);
    let _ = std::fs::remove_file(shm_path);
}
