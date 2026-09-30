// src-tauri/src/db/mod.rs
// SQLite connection layer with WAL pragmas, busy_timeout, foreign_keys,
// and single-writer concurrency safety via Tokio mpsc actor channel.

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use tokio::sync::{mpsc, oneshot};

pub mod migrations;
pub use migrations::{get_user_version, run_atomic_migrations, MigrationStep, MIGRATIONS};

/// Configures SQLite WAL mode, synchronous=NORMAL, busy_timeout=5000, and foreign_keys=ON.
pub fn apply_wal_pragmas(conn: &Connection) -> rusqlite::Result<()> {
    let _: Result<String, _> = conn.query_row("PRAGMA journal_mode = WAL;", [], |r| r.get(0));
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

/// Runs integrity check on the SQLite connection.
/// If corruption or incomplete WAL lock states are detected, logs the error,
/// creates an automatic timestamped backup of the `.db` file (if file-backed),
/// and executes `PRAGMA wal_checkpoint(TRUNCATE);` before booting services.
pub fn verify_and_recover_db(
    conn: &mut Connection,
    db_path: Option<&Path>,
) -> rusqlite::Result<()> {
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;

    let integrity_status: Result<String, _> =
        conn.query_row("PRAGMA integrity_check;", [], |r| r.get(0));

    match integrity_status {
        Ok(ref s) if s == "ok" => {
            // Database integrity verified clean
        }
        status => {
            eprintln!(
                "[SQLite Auto-Recovery] Database integrity issue detected: {:?}",
                status
            );

            if let Some(path) = db_path {
                if path.exists() {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let backup_name = format!(
                        "{}.backup_{}.corrupted",
                        path.file_name().unwrap_or_default().to_string_lossy(),
                        timestamp
                    );
                    let backup_path = path.with_file_name(backup_name);
                    if let Err(e) = std::fs::copy(path, &backup_path) {
                        eprintln!("[SQLite Auto-Recovery] Failed to create backup: {}", e);
                    } else {
                        eprintln!(
                            "[SQLite Auto-Recovery] Created corrupted DB backup at {:?}",
                            backup_path
                        );
                    }
                }
            }

            let _: Result<(i32, i32, i32), _> =
                conn.query_row("PRAGMA wal_checkpoint(TRUNCATE);", [], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                });
        }
    }

    Ok(())
}

/// Initializes a file-based SQLite database with WAL pragmas, auto-recovery checks, and atomic migrations.
pub fn init_database(db_path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(db_path)?;
    apply_wal_pragmas(&conn)?;
    verify_and_recover_db(&mut conn, Some(db_path))?;
    configure_and_migrate(&mut conn)?;
    Ok(conn)
}

/// Initializes an in-memory SQLite database for testing and server execution.
pub fn init_in_memory_db() -> rusqlite::Result<Connection> {
    let mut conn = Connection::open_in_memory()?;
    apply_wal_pragmas(&conn)?;
    verify_and_recover_db(&mut conn, None)?;
    configure_and_migrate(&mut conn)?;
    Ok(conn)
}

/// Configures WAL PRAGMAs then executes all pending versioned schema migrations.
/// Single authoritative runner: tracks via `schema_migrations` table, file-backed SQL.
pub fn configure_and_migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    apply_wal_pragmas(conn)?;
    crate::migrations::run_versioned_migrations(conn)?;
    let _ = run_atomic_migrations(conn, MIGRATIONS);
    Ok(())
}

type DbWriteJob = Box<dyn FnOnce(&mut Connection) -> Result<(), rusqlite::Error> + Send>;

struct DbWriteRequest {
    job: DbWriteJob,
    sender: oneshot::Sender<Result<(), rusqlite::Error>>,
}

/// Single-writer concurrency actor using a dedicated Tokio mpsc channel.
/// Eliminates SQLITE_BUSY write contention by serializing all mutations onto a single owner thread.
#[derive(Clone)]
pub struct DbWriterActor {
    sender: mpsc::Sender<DbWriteRequest>,
}

impl DbWriterActor {
    /// Spawns a dedicated OS thread executing SQLite write jobs sequentially.
    pub fn spawn(db_path: Option<PathBuf>) -> rusqlite::Result<Self> {
        let (tx, mut rx) = mpsc::channel::<DbWriteRequest>(256);

        let mut conn = match &db_path {
            Some(path) => Connection::open(path)?,
            None => Connection::open_in_memory()?,
        };

        apply_wal_pragmas(&conn)?;
        let _ = verify_and_recover_db(&mut conn, db_path.as_deref());
        let _ = configure_and_migrate(&mut conn);

        std::thread::Builder::new()
            .name("sqlite-writer-actor".to_string())
            .spawn(move || {
                while let Some(req) = rx.blocking_recv() {
                    let result = (req.job)(&mut conn);
                    let _ = req.sender.send(result);
                }
            })
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        Ok(Self { sender: tx })
    }

    /// Submits a write closure to be executed exclusively on the writer thread.
    pub async fn write<F>(&self, f: F) -> Result<(), rusqlite::Error>
    where
        F: FnOnce(&mut Connection) -> Result<(), rusqlite::Error> + Send + 'static,
    {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(DbWriteRequest {
                job: Box::new(f),
                sender: tx,
            })
            .await
            .map_err(|_| rusqlite::Error::ExecuteReturnedResults)?;

        rx.await
            .map_err(|_| rusqlite::Error::ExecuteReturnedResults)?
    }
}
