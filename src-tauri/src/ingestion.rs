// src-tauri/src/ingestion.rs
// High-performance Native Ingestion Engine for .dd2vtt / .uvtt Universal VTT Battlemaps
// Parses resolution, grid scale, line-of-sight walls, portals/doors, and point lights.

use serde::{Deserialize, Serialize};
use crate::commands::WallColliderPayload;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UvttPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UvttResolution {
    pub pixels_per_grid: Option<u32>,
    pub map_origin: Option<UvttPoint>,
    pub map_size: Option<UvttPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UvttPortal {
    pub position: Option<UvttPoint>,
    pub bounds: Vec<UvttPoint>,
    pub closed: Option<bool>,
    pub freestanding: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UvttLight {
    pub position: UvttPoint,
    pub range: f64,
    pub intensity: f64,
    pub color: Option<String>,
    pub shadows: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UvttPayload {
    pub format: Option<f64>,
    pub resolution: Option<UvttResolution>,
    #[serde(default)]
    pub line_of_sight: Vec<Vec<UvttPoint>>,
    #[serde(default)]
    pub portals: Vec<UvttPortal>,
    #[serde(default)]
    pub lights: Vec<UvttLight>,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedUvttLight {
    pub x: f64,
    pub y: f64,
    pub range_px: f64,
    pub intensity: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedUvttMap {
    pub grid_size: u32,
    pub walls: Vec<WallColliderPayload>,
    pub lights: Vec<ParsedUvttLight>,
    pub portals_count: usize,
    pub walls_count: usize,
}

/// Parses raw UVTT JSON string into structured geometry and colliders.
pub fn parse_uvtt_map_geometry(raw_json: &str) -> Result<ParsedUvttMap, String> {
    let payload: UvttPayload = serde_json::from_str(raw_json)
        .map_err(|e| format!("Failed to parse UVTT JSON: {}", e))?;

    let grid_size = payload.resolution
        .as_ref()
        .and_then(|r| r.pixels_per_grid)
        .unwrap_or(70);

    let scale = grid_size as f64;
    let mut walls: Vec<WallColliderPayload> = Vec::new();
    let mut wall_idx = 0;

    // 1. Line-of-sight walls (polylines)
    for poly in &payload.line_of_sight {
        for window in poly.windows(2) {
            let p1 = &window[0];
            let p2 = &window[1];
            wall_idx += 1;
            walls.push(WallColliderPayload {
                id: format!("uvtt-wall-{}", wall_idx),
                x1: p1.x * scale,
                y1: p1.y * scale,
                x2: p2.x * scale,
                y2: p2.y * scale,
                blocks_light: Some(true),
                blocks_movement: Some(true),
            });
        }
    }
    let los_walls_count = walls.len();

    // 2. Portals / Doors
    let portals_count = payload.portals.len();
    for (i, portal) in payload.portals.iter().enumerate() {
        if portal.bounds.len() >= 2 {
            let p1 = &portal.bounds[0];
            let p2 = &portal.bounds[1];
            let is_closed = portal.closed.unwrap_or(true);
            walls.push(WallColliderPayload {
                id: format!("uvtt-door-{}", i + 1),
                x1: p1.x * scale,
                y1: p1.y * scale,
                x2: p2.x * scale,
                y2: p2.y * scale,
                blocks_light: Some(is_closed),
                blocks_movement: Some(is_closed),
            });
        }
    }

    // 3. Ambient Point Lights
    let mut lights = Vec::new();
    for light in payload.lights {
        lights.push(ParsedUvttLight {
            x: light.position.x * scale,
            y: light.position.y * scale,
            range_px: light.range * scale,
            intensity: light.intensity,
            color: light.color.unwrap_or_else(|| "#ffaa44".to_string()),
        });
    }

    Ok(ParsedUvttMap {
        grid_size,
        walls,
        lights,
        portals_count,
        walls_count: los_walls_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_uvtt_map_geometry_stress() {
        // Construct 50+ line-of-sight walls, 4 portals, 6 lights
        let mut los = Vec::new();
        for i in 0..52 {
            los.push(vec![
                UvttPoint { x: i as f64, y: 0.0 },
                UvttPoint { x: (i + 1) as f64, y: 1.0 },
            ]);
        }

        let mut portals = Vec::new();
        for i in 0..4 {
            portals.push(UvttPortal {
                position: Some(UvttPoint { x: i as f64, y: 5.0 }),
                bounds: vec![
                    UvttPoint { x: i as f64, y: 4.5 },
                    UvttPoint { x: i as f64, y: 5.5 },
                ],
                closed: Some(i % 2 == 0),
                freestanding: Some(false),
            });
        }

        let mut lights = Vec::new();
        for i in 0..6 {
            lights.push(UvttLight {
                position: UvttPoint { x: (i * 5) as f64, y: 10.0 },
                range: 15.0,
                intensity: 0.85,
                color: Some("#ff9933".to_string()),
                shadows: Some(true),
            });
        }

        let payload = UvttPayload {
            format: Some(0.2),
            resolution: Some(UvttResolution {
                pixels_per_grid: Some(100),
                map_origin: Some(UvttPoint { x: 0.0, y: 0.0 }),
                map_size: Some(UvttPoint { x: 60.0, y: 40.0 }),
            }),
            line_of_sight: los,
            portals,
            lights,
            image: None,
        };

        let raw_json = serde_json::to_string(&payload).expect("Failed to serialize test payload");
        let parsed = parse_uvtt_map_geometry(&raw_json).expect("Failed to parse test UVTT");

        assert_eq!(parsed.grid_size, 100);
        assert_eq!(parsed.walls_count, 52);
        assert_eq!(parsed.portals_count, 4);
        assert_eq!(parsed.walls.len(), 56); // 52 walls + 4 doors
        assert_eq!(parsed.lights.len(), 6);

        for light in &parsed.lights {
            assert!(light.intensity > 0.0);
            assert!(light.range_px > 0.0);
        }
    }
}
