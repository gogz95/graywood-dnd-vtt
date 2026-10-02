// src-tauri/src/services/scene_importers/foundry.rs
// Foundry VTT Scene Transpiler: Ingests fvtt-scene-*.json exports into internal schemas

use crate::commands::WallColliderPayload;
use crate::ingestion::ParsedUvttLight;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundryWallConfig {
    #[serde(default)]
    pub c: Vec<f64>, // [x1, y1, x2, y2]
    #[serde(default)]
    pub door: Option<u8>, // 0: None, 1: Door, 2: Secret
    #[serde(default)]
    pub ds: Option<u8>, // 0: Closed, 1: Open, 2: Locked
    #[serde(default)]
    pub move_type: Option<u8>, // Renamed from move in newer schemas
    #[serde(default)]
    pub sense: Option<u8>, // 0: None, 1: Normal LoS, 2: Limited
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundryLightColorConfig {
    pub color: Option<String>,
    pub alpha: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundryLight {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub dim: Option<f64>,
    #[serde(default)]
    pub bright: Option<f64>,
    #[serde(default)]
    pub config: Option<FoundryLightColorConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundryGrid {
    pub size: Option<u32>,
    pub distance: Option<f64>,
    pub units: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundrySceneExport {
    pub name: Option<String>,
    pub img: Option<String>,
    #[serde(default)]
    pub grid: Option<FoundryGrid>,
    #[serde(default)]
    pub walls: Vec<FoundryWallConfig>,
    #[serde(default)]
    pub lights: Vec<FoundryLight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranspiledFoundryScene {
    pub scene_name: String,
    pub image_url: Option<String>,
    pub grid_size: u32,
    pub grid_distance_feet: f64,
    pub walls: Vec<WallColliderPayload>,
    pub lights: Vec<ParsedUvttLight>,
    pub doors_count: usize,
    pub walls_count: usize,
}

/**
 * Transpiles raw Foundry VTT Scene JSON into internal Graywood VTT wall & light schemas.
 */
pub fn transpile_foundry_scene(raw_json: &str) -> Result<TranspiledFoundryScene, String> {
    let scene: FoundrySceneExport = serde_json::from_str(raw_json)
        .map_err(|e| format!("Failed to parse Foundry VTT Scene JSON: {}", e))?;

    let grid_size = scene.grid.as_ref().and_then(|g| g.size).unwrap_or(100);
    let grid_distance_feet = scene.grid.as_ref().and_then(|g| g.distance).unwrap_or(5.0);

    let mut walls: Vec<WallColliderPayload> = Vec::new();
    let mut doors_count = 0;
    let mut walls_count = 0;

    for (idx, w) in scene.walls.iter().enumerate() {
        if w.c.len() >= 4 {
            let is_door = w.door.unwrap_or(0) > 0;
            if is_door {
                doors_count += 1;
            } else {
                walls_count += 1;
            }

            // Door state 1 is open (non-blocking), 0 and 2 are closed/locked
            let is_open_door = is_door && w.ds.unwrap_or(0) == 1;

            walls.push(WallColliderPayload {
                id: format!("fvtt_wall_{}", idx),
                x1: w.c[0],
                y1: w.c[1],
                x2: w.c[2],
                y2: w.c[3],
                blocks_light: Some(!is_open_door && w.sense.unwrap_or(1) != 0),
                blocks_movement: Some(!is_open_door),
            });
        }
    }

    let mut lights: Vec<ParsedUvttLight> = Vec::new();
    for l in scene.lights {
        let dim = l.dim.unwrap_or(0.0);
        let bright = l.bright.unwrap_or(0.0);
        let max_range = dim.max(bright);

        // Convert grid units to pixels
        let range_px = (max_range / grid_distance_feet) * (grid_size as f64);

        let color = l
            .config
            .as_ref()
            .and_then(|c| c.color.clone())
            .unwrap_or_else(|| "#fbbf24".to_string());

        let intensity = l.config.as_ref().and_then(|c| c.alpha).unwrap_or(0.75);

        lights.push(ParsedUvttLight {
            x: l.x,
            y: l.y,
            range_px,
            intensity,
            color,
        });
    }

    Ok(TranspiledFoundryScene {
        scene_name: scene
            .name
            .unwrap_or_else(|| "Imported Foundry Scene".to_string()),
        image_url: scene.img,
        grid_size,
        grid_distance_feet,
        walls,
        lights,
        doors_count,
        walls_count,
    })
}
