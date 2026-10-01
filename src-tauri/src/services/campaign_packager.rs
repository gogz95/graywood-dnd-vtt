// src-tauri/src/services/campaign_packager.rs
// Native .vttbundle Compressed Archive Packaging & Restoration Pipeline

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VttBundleManifest {
    pub format: String, // "graywood_vttbundle"
    pub version: String, // "1.0.0"
    pub campaign_name: String,
    pub created_at_epoch: u64,
    pub database_included: bool,
    pub dexie_state_included: bool,
    pub assets_count: usize,
    pub total_uncompressed_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportVttBundleResult {
    pub success: bool,
    pub campaign_name: String,
    pub files_extracted: usize,
    pub bytes_extracted: u64,
    pub dexie_state_json: Option<String>,
}

/**
 * Packages campaign SQLite database, Dexie IDB state, and assets into a single .vttbundle archive.
 */
pub fn export_vttbundle(
    db_path: &Path,
    assets_dir: &Path,
    dexie_state_json: Option<&str>,
    output_bundle_path: &Path,
    campaign_name: &str,
) -> Result<VttBundleManifest, String> {
    if let Some(parent) = output_bundle_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create bundle parent directory: {}", e))?;
    }

    let file = File::create(output_bundle_path)
        .map_err(|e| format!("Failed to create bundle archive '{:?}': {}", output_bundle_path, e))?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let mut total_bytes: u64 = 0;
    let mut assets_count: usize = 0;

    // 1. Write Campaign Database
    let db_included = db_path.exists();
    if db_included {
        zip.start_file("campaign.db", options)
            .map_err(|e| format!("Zip error creating campaign.db: {}", e))?;
        let mut db_file = File::open(db_path)
            .map_err(|e| format!("Failed opening campaign.db at '{:?}': {}", db_path, e))?;
        let mut buffer = Vec::new();
        db_file
            .read_to_end(&mut buffer)
            .map_err(|e| format!("Failed reading campaign.db: {}", e))?;
        total_bytes += buffer.len() as u64;
        zip.write_all(&buffer)
            .map_err(|e| format!("Failed writing campaign.db into archive: {}", e))?;
    }

    // 2. Write Dexie State JSON
    let dexie_included = dexie_state_json.is_some();
    if let Some(dexie_content) = dexie_state_json {
        zip.start_file("dexie_state.json", options)
            .map_err(|e| format!("Zip error creating dexie_state.json: {}", e))?;
        let bytes = dexie_content.as_bytes();
        total_bytes += bytes.len() as u64;
        zip.write_all(bytes)
            .map_err(|e| format!("Failed writing dexie_state.json into archive: {}", e))?;
    }

    // 3. Write Assets (maps, tokens, audio, pdfs)
    if assets_dir.exists() && assets_dir.is_dir() {
        for entry in WalkDir::new(assets_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
        {
            let path = entry.path();
            if let Ok(rel_path) = path.strip_prefix(assets_dir) {
                let zip_entry_name = format!("assets/{}", rel_path.to_string_lossy().replace('\\', "/"));
                zip.start_file(&zip_entry_name, options)
                    .map_err(|e| format!("Zip error starting file '{}': {}", zip_entry_name, e))?;

                let mut asset_file = File::open(path)
                    .map_err(|e| format!("Failed opening asset '{:?}': {}", path, e))?;
                let mut buffer = Vec::new();
                asset_file
                    .read_to_end(&mut buffer)
                    .map_err(|e| format!("Failed reading asset '{:?}': {}", path, e))?;

                total_bytes += buffer.len() as u64;
                assets_count += 1;
                zip.write_all(&buffer)
                    .map_err(|e| format!("Failed writing asset '{}' into zip: {}", zip_entry_name, e))?;
            }
        }
    }

    // 4. Write Bundle Manifest
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let manifest = VttBundleManifest {
        format: "graywood_vttbundle".to_string(),
        version: "1.0.0".to_string(),
        campaign_name: campaign_name.to_string(),
        created_at_epoch: now,
        database_included: db_included,
        dexie_state_included: dexie_included,
        assets_count,
        total_uncompressed_bytes: total_bytes,
    };

    zip.start_file("bundle_manifest.json", options)
        .map_err(|e| format!("Zip error creating bundle_manifest.json: {}", e))?;
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| format!("Serialization error for bundle manifest: {}", e))?;
    zip.write_all(&manifest_bytes)
        .map_err(|e| format!("Failed writing bundle_manifest.json: {}", e))?;

    zip.finish()
        .map_err(|e| format!("Failed finalizing .vttbundle archive: {}", e))?;

    Ok(manifest)
}

/**
 * Validates and restores a .vttbundle archive into a destination campaign directory.
 */
pub fn import_vttbundle(
    bundle_path: &Path,
    target_campaign_dir: &Path,
) -> Result<ImportVttBundleResult, String> {
    let file = File::open(bundle_path)
        .map_err(|e| format!("Failed to open .vttbundle at '{:?}': {}", bundle_path, e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read .vttbundle zip archive: {}", e))?;

    fs::create_dir_all(target_campaign_dir)
        .map_err(|e| format!("Failed to create target campaign dir: {}", e))?;

    // 1. Verify and read manifest
    let mut manifest: Option<VttBundleManifest> = None;
    if let Ok(mut manifest_entry) = archive.by_name("bundle_manifest.json") {
        let mut manifest_str = String::new();
        if manifest_entry.read_to_string(&mut manifest_str).is_ok() {
            manifest = serde_json::from_str(&manifest_str).ok();
        }
    }

    let campaign_name = manifest
        .as_ref()
        .map(|m| m.campaign_name.clone())
        .unwrap_or_else(|| "Restored Campaign".to_string());

    let mut dexie_state_json: Option<String> = None;
    let mut files_extracted = 0;
    let mut bytes_extracted = 0;

    for i in 0..archive.len() {
        let mut file_entry = archive
            .by_index(i)
            .map_err(|e| format!("Archive index error: {}", e))?;

        let entry_name = file_entry.name().to_string();

        if entry_name == "bundle_manifest.json" {
            continue;
        }

        if entry_name == "dexie_state.json" {
            let mut s = String::new();
            file_entry
                .read_to_string(&mut s)
                .map_err(|e| format!("Error reading dexie_state.json: {}", e))?;
            bytes_extracted += s.len() as u64;
            dexie_state_json = Some(s);
            continue;
        }

        let outpath = target_campaign_dir.join(&entry_name);

        if file_entry.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create dir '{:?}': {}", outpath, e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)
                        .map_err(|e| format!("Failed creating parent dir '{:?}': {}", p, e))?;
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| format!("Failed creating out file '{:?}': {}", outpath, e))?;
            let mut buffer = Vec::new();
            file_entry
                .read_to_end(&mut buffer)
                .map_err(|e| format!("Failed reading entry '{}': {}", entry_name, e))?;

            bytes_extracted += buffer.len() as u64;
            files_extracted += 1;
            outfile
                .write_all(&buffer)
                .map_err(|e| format!("Failed writing out file '{:?}': {}", outpath, e))?;
        }
    }

    Ok(ImportVttBundleResult {
        success: true,
        campaign_name,
        files_extracted,
        bytes_extracted,
        dexie_state_json,
    })
}
