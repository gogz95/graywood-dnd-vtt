pub mod api;
pub mod commands;
pub mod db;
pub mod ingestion;
pub mod migrations;
pub mod models;
pub mod server;
pub mod services;
pub mod state;
pub mod systems;

pub use commands::{
    compile_sourcebook_pdf, export_campaign_archive_cmd, export_vttbundle_cmd,
    extract_tables_from_sourcebook_cmd, get_active_workspace, get_hydrated_entities,
    get_rollable_tables_cmd, import_pdf, import_vttbundle_cmd, ingest_pdf, initialize_workspace,
    open_directory_dialog, open_file_dialog, open_projector_window, pick_and_read_campaign_folder,
    save_map_vector_geometry, scan_ingest_directory, search_campaign_fts, seed_compendium_baseline, set_active_workspace,
    spawn_combatant_token_cmd, sync_party_rest_recovery, sync_workspace_tables_cmd, transpile_foundry_scene_cmd,
    transpile_roll20_page_cmd, validate_workspace, FtsSearchResult, HydratedEntityRecord,
    HydratedWorkspaceData, IngestPdfResult, IngestScanEntry, IngestScanResult, IngestedFileEntry,
    RollableTableRecord, SaveMapVectorRequest, SeedCompendiumResult, SyncPartyRestPayload, TableEntry, TableProvenance, WallColliderPayload,
    WorkspaceConfig, WorkspaceMetadata,
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

/// Applies required plugins (single-instance, native dialogs) and custom asset protocol to a Tauri builder.
pub fn configure_single_instance<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .plugin(init_single_instance())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("graywood-asset", |_app, req| {
            crate::services::workspace_manager::handle_asset_protocol_request(req)
        })
}
