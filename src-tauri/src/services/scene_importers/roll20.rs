// src-tauri/src/services/scene_importers/roll20.rs
// Roll20 Campaign & Page Schema Transpiler: Ingests Roll20 page JSON exports into internal schemas

use crate::commands::WallColliderPayload;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roll20PathGraphic {
    pub id: Option<String>,
    pub layer: Option<String>, // "walls" for dynamic lighting paths, "map", "objects"
    pub left: Option<f64>,
    pub top: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub path: Option<serde_json::Value>, // Serialized path points e.g. [["M",0,0],["L",100,50]]
    pub imgsrc: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roll20PageExport {
    pub id: Option<String>,
    pub name: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub scale_number: Option<f64>, // Default 5 (feet per 70px cell)
    pub snapping_increment: Option<f64>,
    #[serde(default)]
    pub graphics: Vec<Roll20PathGraphic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranspiledRoll20Page {
    pub page_name: String,
    pub background_image_url: Option<String>,
    pub grid_size: u32,
    pub width_px: f64,
    pub height_px: f64,
    pub walls: Vec<WallColliderPayload>,
    pub tokens_count: usize,
}

/**
 * Transpiles Roll20 Page JSON export into internal Graywood VTT colliders and assets.
 */
pub fn transpile_roll20_page(raw_json: &str) -> Result<TranspiledRoll20Page, String> {
    let page: Roll20PageExport = serde_json::from_str(raw_json)
        .map_err(|e| format!("Failed to parse Roll20 Page JSON: {}", e))?;

    let grid_size = 70; // Standard 70px Roll20 cell size
    let width_px = page.width.unwrap_or(25.0) * (grid_size as f64);
    let height_px = page.height.unwrap_or(25.0) * (grid_size as f64);

    let mut background_image_url = None;
    let mut walls: Vec<WallColliderPayload> = Vec::new();
    let mut tokens_count = 0;

    for (idx, g) in page.graphics.iter().enumerate() {
        let layer = g.layer.as_deref().unwrap_or("");

        if layer == "map" && background_image_url.is_none() && g.imgsrc.is_some() {
            background_image_url = g.imgsrc.clone();
        } else if layer == "objects" {
            tokens_count += 1;
        } else if layer == "walls" {
            // Dynamic Lighting path vector collider
            let origin_x = g.left.unwrap_or(0.0);
            let origin_y = g.top.unwrap_or(0.0);

            // If path contains point segments
            if let Some(path_val) = &g.path {
                let segments = extract_path_segments(path_val, origin_x, origin_y);
                for (s_idx, (p1, p2)) in segments.into_iter().enumerate() {
                    walls.push(WallColliderPayload {
                        id: format!("r20_wall_{}_{}", idx, s_idx),
                        x1: p1.0,
                        y1: p1.1,
                        x2: p2.0,
                        y2: p2.1,
                        blocks_light: Some(true),
                        blocks_movement: Some(true),
                    });
                }
            } else if let (Some(w), Some(h)) = (g.width, g.height) {
                // Bounding box line segment fallback
                walls.push(WallColliderPayload {
                    id: format!("r20_wall_{}", idx),
                    x1: origin_x - w / 2.0,
                    y1: origin_y,
                    x2: origin_x + w / 2.0,
                    y2: origin_y + h,
                    blocks_light: Some(true),
                    blocks_movement: Some(true),
                });
            }
        }
    }

    Ok(TranspiledRoll20Page {
        page_name: page
            .name
            .unwrap_or_else(|| "Imported Roll20 Page".to_string()),
        background_image_url,
        grid_size,
        width_px,
        height_px,
        walls,
        tokens_count,
    })
}

fn extract_path_segments(
    path_val: &serde_json::Value,
    origin_x: f64,
    origin_y: f64,
) -> Vec<((f64, f64), (f64, f64))> {
    let mut segments = Vec::new();

    // Roll20 path can be a JSON string like "[[\"M\",0,0],[\"L\",100,50]]" or direct array
    let points_array: Vec<Vec<serde_json::Value>> = if let Some(s) = path_val.as_str() {
        serde_json::from_str(s).unwrap_or_default()
    } else if let Some(arr) = path_val.as_array() {
        arr.iter()
            .filter_map(|item| item.as_array().cloned())
            .collect()
    } else {
        Vec::new()
    };

    let mut current_pt: Option<(f64, f64)> = None;

    for cmd in points_array {
        if cmd.is_empty() {
            continue;
        }
        let op = cmd[0].as_str().unwrap_or("");
        if (op == "M" || op == "L") && cmd.len() >= 3 {
            let px = cmd[1].as_f64().unwrap_or(0.0) + origin_x;
            let py = cmd[2].as_f64().unwrap_or(0.0) + origin_y;

            if op == "L" {
                if let Some(prev) = current_pt {
                    segments.push((prev, (px, py)));
                }
            }
            current_pt = Some((px, py));
        }
    }

    segments
}
