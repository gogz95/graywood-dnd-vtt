use rusqlite::Connection;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: [Migration; 5] = [
    Migration {
        version: 1,
        name: "001_initial_schema",
        sql: include_str!("../migrations/001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        name: "002_compendium",
        sql: include_str!("../migrations/002_compendium.sql"),
    },
    Migration {
        version: 3,
        name: "003_calendar_and_contracts",
        sql: include_str!("../migrations/003_calendar_and_contracts.sql"),
    },
    Migration {
        version: 4,
        name: "004_encounters_and_monsters",
        sql: include_str!("../migrations/004_encounters_and_monsters.sql"),
    },
    Migration {
        version: 5,
        name: "005_ostrava_and_crafting",
        sql: include_str!("../migrations/005_ostrava_and_crafting.sql"),
    },
];

/// Applies all pending version-controlled SQLite migrations transactionally and idempotently.
pub fn run_versioned_migrations(conn: &mut Connection) -> Result<u32, rusqlite::Error> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let _: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
             version INTEGER PRIMARY KEY NOT NULL,
             name TEXT NOT NULL,
             applied_at BIGINT NOT NULL
         );",
    )?;

    let mut applied_count = 0;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    for m in &MIGRATIONS {
        let is_applied: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM schema_migrations WHERE version = ?1",
            [m.version],
            |r| r.get(0),
        )?;

        if !is_applied {
            let tx = conn.transaction()?;
            tx.execute_batch(m.sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![m.version, m.name, now],
            )?;
            tx.commit()?;
            applied_count += 1;
        }
    }

    Ok(applied_count)
}

/// Safely packages the local campaign SQLite database, asset directory, and metadata
/// into a single compressed `.aleamos` archive file for full disaster recovery and backup.
pub fn export_campaign_archive(
    db_path: &Path,
    assets_dir: &Path,
    output_archive_path: &Path,
) -> Result<(), String> {
    if let Some(parent) = output_archive_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output dir: {}", e))?;
    }

    let file = File::create(output_archive_path).map_err(|e| {
        format!(
            "Failed to create archive file '{:?}': {}",
            output_archive_path, e
        )
    })?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // 1. Write Campaign Database
    if db_path.exists() {
        zip.start_file("campaign.db", options)
            .map_err(|e| format!("Zip error creating campaign.db entry: {}", e))?;
        let mut db_file = File::open(db_path)
            .map_err(|e| format!("Failed to open campaign.db at '{:?}': {}", db_path, e))?;
        let mut buffer = Vec::new();
        db_file
            .read_to_end(&mut buffer)
            .map_err(|e| format!("Failed reading campaign.db: {}", e))?;
        zip.write_all(&buffer)
            .map_err(|e| format!("Failed writing campaign.db to zip: {}", e))?;
    }

    // 2. Write Metadata Manifest
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let manifest = serde_json::json!({
        "format": "aleamos_campaign_archive",
        "version": "1.0.0",
        "created_at_epoch": now,
        "database_included": db_path.exists(),
        "schema_version": MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
    });

    zip.start_file("metadata.json", options)
        .map_err(|e| format!("Zip error creating metadata.json: {}", e))?;
    zip.write_all(manifest.to_string().as_bytes())
        .map_err(|e| format!("Failed writing metadata.json: {}", e))?;

    // 3. Write Assets Directory Recursively
    if assets_dir.exists() && assets_dir.is_dir() {
        add_directory_to_zip(&mut zip, assets_dir, "assets", options)?;
    }

    zip.finish()
        .map_err(|e| format!("Failed finalizing .aleamos archive: {}", e))?;

    Ok(())
}

fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory '{:?}': {}", dir, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry error: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        let zip_path = format!("{}/{}", prefix, file_name_str);

        if path.is_dir() {
            add_directory_to_zip(zip, &path, &zip_path, options)?;
        } else if path.is_file() {
            zip.start_file(&zip_path, options)
                .map_err(|e| format!("Zip error starting file '{}': {}", zip_path, e))?;
            let mut file = File::open(&path)
                .map_err(|e| format!("Failed opening asset file '{:?}': {}", path, e))?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)
                .map_err(|e| format!("Failed reading asset file: {}", e))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("Failed writing asset to zip: {}", e))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_versioned_migrations_idempotency() {
        let mut conn = Connection::open_in_memory().expect("In memory DB open failed");

        let first_run = run_versioned_migrations(&mut conn).expect("First migration run failed");
        assert_eq!(first_run, 5);

        // Second run must apply 0 new migrations (idempotency guarantee)
        let second_run = run_versioned_migrations(&mut conn).expect("Second migration run failed");
        assert_eq!(second_run, 0);

        let applied_total: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(applied_total, 5);
    }

    #[test]
    fn test_export_campaign_archive_generation() {
        let temp_dir = std::env::temp_dir().join(format!("aleamos_test_{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("test_campaign.db");
        let assets_path = temp_dir.join("assets");
        std::fs::create_dir_all(&assets_path).unwrap();

        // Create sample db and asset file
        std::fs::write(&db_path, b"SQLITE_TEST_CONTENT").unwrap();
        std::fs::write(assets_path.join("map_tile.webp"), b"WEBP_MOCK_DATA").unwrap();

        let archive_out = temp_dir.join("test_backup.aleamos");
        let result = export_campaign_archive(&db_path, &assets_path, &archive_out);
        assert!(result.is_ok());
        assert!(archive_out.exists());

        // Verify zip contents
        let file = File::open(&archive_out).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive.by_name("campaign.db").is_ok());
        assert!(archive.by_name("metadata.json").is_ok());
        assert!(archive.by_name("assets/map_tile.webp").is_ok());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
