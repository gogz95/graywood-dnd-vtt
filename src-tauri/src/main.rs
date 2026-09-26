use graywood_vtt_lib::{init_database, run_server, AppState, DEFAULT_SERVER_ADDR};
use std::path::{Path, PathBuf};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Initializing Graywood VTT DM Desktop Workstation...");

    // --- Dev-mode devUrl reachability pre-check (non-fatal) ---
    #[cfg(debug_assertions)]
    {
        let dev_url = "http://127.0.0.1:5173";
        match tokio::net::TcpStream::connect("127.0.0.1:5173").await {
            Ok(_) => println!("[dev] devUrl {} is reachable.", dev_url),
            Err(e) => eprintln!(
                "[dev] WARNING: devUrl {} is NOT reachable ({}). \
                 Start the Vite dev server first (`npm --prefix frontend run dev`).",
                dev_url, e
            ),
        }
    }

    let db_path = Path::new("campaign.db");
    let conn = init_database(db_path)?;
    println!(
        "Database initialized and migrations verified at: {:?}",
        db_path
    );

    // Static assets directory for local client delivery & PWA
    let assets_dir = if Path::new("./dist").exists() {
        PathBuf::from("./dist")
    } else if Path::new("../dist").exists() {
        PathBuf::from("../dist")
    } else if Path::new("./frontend/dist").exists() {
        PathBuf::from("./frontend/dist")
    } else {
        PathBuf::from("./static")
    };

    let secret_key = b"graywood_vtt_dm_workstation_secret_key_9876543210".to_vec();
    let app_state = AppState::new(conn, secret_key, assets_dir);

    run_server(app_state, DEFAULT_SERVER_ADDR).await?;

    Ok(())
}
