pub mod api;
pub mod commands;
pub mod db;
pub mod migrations;
pub mod models;
pub mod server;
pub mod state;
pub mod systems;

pub use commands::{
    export_campaign_archive_cmd, open_projector_window, pick_and_read_campaign_folder,
    scan_ingest_directory, spawn_combatant_token_cmd, IngestScanEntry, IngestScanResult,
    IngestedFileEntry,
};
pub use db::{configure_and_migrate, init_database, init_in_memory_db};
pub use migrations::{export_campaign_archive, run_versioned_migrations};
pub use models::*;
pub use server::{
    bind_dynamic_listener, create_router, run_server, AppState, ServerError, WsEvent,
    DEFAULT_SERVER_ADDR, LAN_ASSET_SERVER_ADDR,
};
pub use systems::*;

use tauri::Manager;

/// Initializes and configures the single-instance plugin for Tauri 2.
/// When a secondary launch occurs, it brings the primary window to the foreground
/// and prevents TCP port binding collisions.
pub fn init_single_instance<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let window = app
            .get_webview_window("main")
            .or_else(|| app.webview_windows().values().next().cloned());
        if let Some(w) = window {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    })
}

/// Applies required plugins (single-instance, native dialogs) to a Tauri builder.
pub fn configure_single_instance<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .plugin(init_single_instance())
        .plugin(tauri_plugin_dialog::init())
}
