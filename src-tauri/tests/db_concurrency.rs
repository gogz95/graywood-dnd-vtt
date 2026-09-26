// src-tauri/tests/db_concurrency.rs
// Integration tests verifying SQLite WAL concurrency with zero SQLITE_BUSY errors
// and atomic migration rollback without PRAGMA user_version corruption.

use graywood_vtt_lib::db::{
    apply_wal_pragmas, get_user_version, run_atomic_migrations, DbWriterActor, MigrationStep,
    MIGRATIONS,
};
use rusqlite::Connection;
use std::time::{SystemTime, UNIX_EPOCH};

#[tokio::test]
async fn test_concurrent_writes_zero_sqlite_busy() {
    let temp_db_path = std::env::temp_dir().join(format!(
        "graywood_wal_test_{}.db",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));

    let actor =
        DbWriterActor::spawn(Some(temp_db_path.clone())).expect("Failed to spawn DbWriterActor");

    // Initialize test table with counter = 0
    actor
        .write(|conn| {
            conn.execute(
                "CREATE TABLE IF NOT EXISTS concurrent_counter (id INTEGER PRIMARY KEY, count INTEGER NOT NULL);",
                [],
            )?;
            conn.execute(
                "INSERT INTO concurrent_counter (id, count) VALUES (1, 0);",
                [],
            )?;
            Ok(())
        })
        .await
        .expect("Failed to initialize concurrent_counter table");

    // Spawn 20 concurrent Tokio tasks writing increments to the test table
    let mut handles = Vec::new();
    for _ in 0..20 {
        let actor_clone = actor.clone();
        handles.push(tokio::spawn(async move {
            actor_clone
                .write(|conn| {
                    conn.execute(
                        "UPDATE concurrent_counter SET count = count + 1 WHERE id = 1;",
                        [],
                    )?;
                    Ok(())
                })
                .await
        }));
    }

    // Assert all 20 writes complete successfully with 0 SQLITE_BUSY errors
    for handle in handles {
        let result = handle.await.expect("Tokio task panicked");
        assert!(
            result.is_ok(),
            "Concurrent write must succeed without SQLITE_BUSY: {:?}",
            result
        );
    }

    // Assert final counter value is exactly 20
    actor
        .write(|conn| {
            let final_count: i64 = conn.query_row(
                "SELECT count FROM concurrent_counter WHERE id = 1;",
                [],
                |r| r.get(0),
            )?;
            assert_eq!(final_count, 20, "Expected all 20 writes to be applied");
            Ok(())
        })
        .await
        .expect("Failed to verify counter value");

    // Teardown temporary database files
    let _ = std::fs::remove_file(&temp_db_path);
    let _ = std::fs::remove_file(format!("{}-wal", temp_db_path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", temp_db_path.display()));
}

#[test]
fn test_malformed_migration_rollback_and_user_version() {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory db");
    apply_wal_pragmas(&conn).expect("Failed to apply WAL pragmas");

    // 1. Initial user_version must be 0
    let v0 = get_user_version(&conn).expect("Failed to read initial user_version");
    assert_eq!(v0, 0);

    // 2. Run valid baseline migration v1
    let applied = run_atomic_migrations(&mut conn, &MIGRATIONS[..1])
        .expect("Failed to run baseline migration");
    assert!(
        applied >= 1,
        "Baseline migration should apply at least 1 migration step"
    );

    let v1 = get_user_version(&conn).expect("Failed to read user_version after v1");
    assert_eq!(v1, 1);

    // Assert baseline tables exist
    let has_campaign_settings: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='campaign_settings'",
            [],
            |r| r.get(0),
        )
        .expect("Failed checking campaign_settings table");
    assert!(
        has_campaign_settings,
        "campaign_settings table must be created in v1"
    );

    let has_scenes: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='scenes'",
            [],
            |r| r.get(0),
        )
        .expect("Failed checking scenes table");
    assert!(has_scenes, "scenes table must be created in v1");

    // 3. Define a malformed migration v2 that fails mid-transaction
    let malformed_migrations = [MigrationStep {
        version: 2,
        name: "002_corrupt_step",
        sql: "
            CREATE TABLE uncommitted_table (id TEXT PRIMARY KEY NOT NULL);
            SYNTAX ERROR INVALID SQL TRIGGERING FAILURE;
        ",
    }];

    let result = run_atomic_migrations(&mut conn, &malformed_migrations);
    assert!(result.is_err(), "Malformed migration must return an error");

    // 4. Assert user_version remains 1 and is NOT corrupted
    let v_after =
        get_user_version(&conn).expect("Failed to read user_version after failed migration");
    assert_eq!(
        v_after, 1,
        "user_version must remain unchanged at 1 after rollback"
    );

    // 5. Assert uncommitted_table was rolled back and does not exist
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='uncommitted_table'",
            [],
            |r| r.get(0),
        )
        .expect("Failed checking uncommitted_table existence");
    assert!(
        !table_exists,
        "Table from failed migration must be rolled back cleanly"
    );
}
