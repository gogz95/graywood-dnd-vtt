use graywood_vtt_lib::{
    configure_single_instance, init_database, run_server, AppState, DEFAULT_SERVER_ADDR,
};
use std::path::{Path, PathBuf};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Initializing Graywood VTT DM Desktop Workstation...");

    // Crash Telemetry: Global panic hook for crash reporting and diagnostics
    std::panic::set_hook(Box::new(|panic_info| {
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        eprintln!(
            "[CRITICAL CRASH TELEMETRY] Panic caught at {}: {}",
            location, payload
        );
    }));

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
            graywood_vtt_lib::commands::open_file_dialog,
            graywood_vtt_lib::commands::open_directory_dialog,
            graywood_vtt_lib::commands::pick_and_read_campaign_folder,
            graywood_vtt_lib::commands::scan_ingest_directory,
            graywood_vtt_lib::commands::search_campaign_fts,
            graywood_vtt_lib::commands::export_vttbundle_cmd,
            graywood_vtt_lib::commands::import_vttbundle_cmd,
            graywood_vtt_lib::commands::transpile_foundry_scene_cmd,
            graywood_vtt_lib::commands::transpile_roll20_page_cmd,
            graywood_vtt_lib::commands::ingest_pdf,
            graywood_vtt_lib::commands::import_pdf,
            graywood_vtt_lib::commands::set_active_workspace,
            graywood_vtt_lib::commands::validate_workspace,
            graywood_vtt_lib::commands::get_active_workspace,
            graywood_vtt_lib::commands::initialize_workspace,
            graywood_vtt_lib::commands::compile_sourcebook_pdf,
            graywood_vtt_lib::commands::sync_workspace_tables_cmd,
            graywood_vtt_lib::commands::get_rollable_tables_cmd,
            graywood_vtt_lib::commands::extract_tables_from_sourcebook_cmd,
            graywood_vtt_lib::commands::get_hydrated_entities,
            graywood_vtt_lib::commands::seed_compendium_baseline,
            graywood_vtt_lib::commands::sync_party_rest_recovery,
            graywood_vtt_lib::commands::crawl_sourcebooks,
            graywood_vtt_lib::commands::get_pdf_page_image,
            graywood_vtt_lib::commands::get_provenance_snippet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
