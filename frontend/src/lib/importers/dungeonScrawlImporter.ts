// dungeonScrawlImporter.ts — Native Dungeon Scrawl File Ingestion & Stage Binding
// Ingests .ds and .json exports, binds blocking geometry to LightShadowRenderer,
// generates interactive door markers, and snaps the stage grid to 5-ft increments.

import { parseDungeonScrawl, type WallSegment, type DoorPrimitive, type DungeonScrawlParsedMap } from '../canvas/parsers/dungeonScrawlParser';
import { canvasStore } from '../../stores/canvasStore.svelte';
import { audioEngine } from '../audio/AudioEngine';

export interface DungeonScrawlImportResult {
  success: boolean;
  name: string;
  wallsCount: number;
  doorsCount: number;
  gridSize: number;
  error?: string;
}

/**
 * Parses raw Dungeon Scrawl JSON or .ds content and applies it directly
 * to the active battle mat canvas store and light/shadow renderer.
 */
export function applyDungeonScrawlMap(
  data: string | Record<string, unknown>,
  targetGridSize = 60
): DungeonScrawlImportResult {
  try {
    const parsed: DungeonScrawlParsedMap = parseDungeonScrawl(data, targetGridSize);

    // 1. Grid Alignment: Snap stage grid directly to parsed 5 ft increment
    const effectiveGridSize = parsed.gridSize || targetGridSize;
    canvasStore.setGridSize(effectiveGridSize);

    // 2. Geometry Extraction & Wall Binding: register static blocking segments into canvasStore
    canvasStore.setWallsAndDoors(parsed.walls, parsed.doors);

    // 3. Dispatch notification for LightShadowRenderer and TacticalMat
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:dungeon-scrawl-imported', {
          detail: {
            walls: parsed.walls,
            doors: parsed.doors,
            gridSize: effectiveGridSize,
            name: parsed.name,
          },
        })
      );
    }

    audioEngine.triggerSfx('sfx-secret');

    return {
      success: true,
      name: parsed.name,
      wallsCount: parsed.walls.length,
      doorsCount: parsed.doors.length,
      gridSize: effectiveGridSize,
    };
  } catch (err: any) {
    console.error('Failed to import Dungeon Scrawl scene:', err);
    return {
      success: false,
      name: 'Unknown',
      wallsCount: 0,
      doorsCount: 0,
      gridSize: targetGridSize,
      error: err.message || 'Corrupt Dungeon Scrawl format',
    };
  }
}

/**
 * Handles browser/Tauri file drop or input selection of .ds / .json maps.
 */
export async function importDungeonScrawlFile(
  file: File,
  targetGridSize = 60
): Promise<DungeonScrawlImportResult> {
  try {
    const text = await file.text();
    return applyDungeonScrawlMap(text, targetGridSize);
  } catch (err: any) {
    return {
      success: false,
      name: file.name,
      wallsCount: 0,
      doorsCount: 0,
      gridSize: targetGridSize,
      error: `File read failed: ${err.message}`,
    };
  }
}
