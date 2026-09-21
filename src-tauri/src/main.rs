use aleamos_desktop_lib::{init_database, run_server, AppState, DEFAULT_SERVER_ADDR};
use std::path::{Path, PathBuf};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Initializing Aleamos DM Desktop Workstation...");

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

    let secret_key = b"aleamos_dm_workstation_secret_key_9876543210".to_vec();
    let app_state = AppState::new(conn, secret_key, assets_dir);

    println!(
        "Starting embedded Axum server on http://{}",
        DEFAULT_SERVER_ADDR
    );
    run_server(app_state, DEFAULT_SERVER_ADDR).await?;

    Ok(())
}
