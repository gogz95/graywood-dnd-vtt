use graywood_vtt_lib::{
    configure_single_instance, init_database, run_server, AppState, DEFAULT_SERVER_ADDR,
};
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

    // 1. Run Axum server in a background task so it doesn't block the GUI
    let server_state = app_state.clone();
    tokio::spawn(async move {
        if let Err(err) = run_server(server_state, DEFAULT_SERVER_ADDR).await {
            eprintln!("[Axum Server Fatal Error]: {}", err);
        }
    });

    // 2. Attach plugins (single-instance & tauri-plugin-dialog)
    let builder = tauri::Builder::default();
    let builder = configure_single_instance(builder);

    // 3. Register state and the actual Tauri IPC command
    builder
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            graywood_vtt_lib::commands::open_projector_window,
            graywood_vtt_lib::commands::save_map_vector_geometry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
