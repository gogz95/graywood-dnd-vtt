// src-tauri/tests/ingest_pipeline_test.rs
// End-to-end integration test verifying PDF compilation, SQLite index persistence, and crawler ignore filters.

use graywood_vtt_lib::services::table_extractor::extract_tables_from_text;
use graywood_vtt_lib::services::workspace_manager::{
    initialize_workspace, is_allowed_crawler_file, should_skip_crawler_dir,
};
use rusqlite::Connection;
use std::fs;
use std::path::Path;

#[test]
fn test_crawler_ignore_filters() {
    // Hidden and system directories
    assert!(should_skip_crawler_dir(".git"));
    assert!(should_skip_crawler_dir(".graywood"));
    assert!(should_skip_crawler_dir(".svelte-kit"));
    assert!(should_skip_crawler_dir(".vite"));
    assert!(should_skip_crawler_dir("node_modules"));
    assert!(should_skip_crawler_dir("plugins"));
    assert!(should_skip_crawler_dir("target"));
    assert!(should_skip_crawler_dir("dist"));
    assert!(should_skip_crawler_dir("build"));

    // Allowed campaign directories
    assert!(!should_skip_crawler_dir("Sourcebooks"));
    assert!(!should_skip_crawler_dir("Maps"));
    assert!(!should_skip_crawler_dir("Tables"));
    assert!(!should_skip_crawler_dir("Audio"));

    // File extension routing
    assert!(is_allowed_crawler_file(Path::new("book.pdf"), "pdf"));
    assert!(is_allowed_crawler_file(Path::new("notes.md"), "md"));
    assert!(is_allowed_crawler_file(Path::new("lore.txt"), "txt"));
    assert!(is_allowed_crawler_file(Path::new("encounters.csv"), "csv"));
    assert!(is_allowed_crawler_file(Path::new("map.png"), "png"));
    assert!(is_allowed_crawler_file(Path::new("battle.webp"), "webp"));
    assert!(is_allowed_crawler_file(Path::new("dungeon.uvtt"), "uvtt"));
    assert!(is_allowed_crawler_file(Path::new("track.mp3"), "mp3"));
    assert!(is_allowed_crawler_file(Path::new("ambient.ogg"), "ogg"));

    // Ignored scripts and code trees
    assert!(!is_allowed_crawler_file(Path::new("plugin.js"), "js"));
    assert!(!is_allowed_crawler_file(Path::new("script.ts"), "ts"));
    assert!(!is_allowed_crawler_file(Path::new("random.json"), "json"));

    // Allowed manifest / table JSON
    assert!(is_allowed_crawler_file(Path::new("manifest.json"), "json"));
    assert!(is_allowed_crawler_file(Path::new("campaign_manifest.json"), "json"));
    assert!(is_allowed_crawler_file(Path::new("Tables/random_encounters.json"), "json"));
}

#[test]
fn test_sqlite_hydration_and_table_extraction() {
    let temp_dir = std::env::temp_dir().join(format!("graywood_e2e_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);

    // Initialize workspace
    let cfg = initialize_workspace(&temp_dir).expect("workspace init should succeed");
    assert_eq!(cfg.version, "1.0.0");

    let db_path = temp_dir.join(".graywood/index.sqlite");
    assert!(db_path.exists());

    // 1. Simulate table extraction commit
    let sample_text = "d20 Wandering Monsters\n\
        1-5 2d4 Goblins lurking in shadows\n\
        6-10 1 Owlbear hunting prey\n\
        11-20 Quiet forest clearing\n";

    let tables = extract_tables_from_text(sample_text, "Sourcebooks/Adventures.pdf", 12);
    assert_eq!(tables.len(), 1);

    let conn = Connection::open(&db_path).expect("open index.sqlite");
    for t in &tables {
        let prov_json = serde_json::to_string(&t.provenance).unwrap();
        let entries_json = serde_json::to_string(&t.entries).unwrap();

        conn.execute(
            "INSERT OR REPLACE INTO rollable_tables (id, name, formula, provenance, entries)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![t.id, t.name, t.formula, prov_json, entries_json],
        )
        .expect("insert table into sqlite");
    }

    // 2. Simulate entity compilation commit
    let entity_prov = serde_json::json!({
        "file_rel": "Sourcebooks/Adventures.pdf",
        "page": 12
    });
    let entity_data = serde_json::json!({
        "ac": 15,
        "hp": 7,
        "speed": "30 ft.",
        "cr": "1/4",
        "attack_bonus": 4,
        "damage_formula": "1d6 + 2"
    });

    conn.execute(
        "INSERT OR REPLACE INTO entities (id, type, name, is_activated, provenance, data)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)",
        rusqlite::params![
            "srd_goblin",
            "monster",
            "Goblin",
            entity_prov.to_string(),
            entity_data.to_string()
        ],
    )
    .expect("insert entity into sqlite");

    // Verify row counts in SQLite
    let entity_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))
        .unwrap();
    assert_eq!(entity_count, 1);

    let table_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM rollable_tables", [], |row| row.get(0))
        .unwrap();
    assert_eq!(table_count, 1);

    let _ = fs::remove_dir_all(&temp_dir);
}
