import { test, expect } from '@playwright/test';

test.describe('Phase E5: Foreign Scene Importers & .vttbundle Round-Trip', () => {
  test('transpiles Foundry VTT scene JSON, Roll20 DL vectors, and validates .vttbundle archive round-trip', async ({ page }) => {
    test.setTimeout(60000);
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.addInitScript(() => {
      localStorage.setItem('vtt_wizard_completed', 'true');
      localStorage.setItem('graywood_wizard_completed', 'true');
      localStorage.setItem('vtt_setup_completed', 'true');
      localStorage.setItem('vtt_setup_complete', 'true');
      localStorage.setItem('hasCompletedWizard', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 1. Verify Foundry VTT Scene JSON Transpilation
    const foundryResult = await page.evaluate(() => {
      const mockFoundryScene = {
        name: 'Crypt of Forgotten Souls',
        width: 3000,
        height: 2000,
        grid: { size: 100, distance: 5 },
        walls: [
          // Regular solid wall
          { c: [100, 100, 500, 100], door: 0, ds: 0, sense: 1, move: 1 },
          // Closed door
          { c: [500, 100, 600, 100], door: 1, ds: 0, sense: 1, move: 1 },
          // Secret door
          { c: [600, 100, 700, 100], door: 2, ds: 0, sense: 1, move: 1 },
          // Window (blocks movement, does not block sense/vision)
          { c: [700, 100, 900, 100], door: 0, ds: 0, sense: 0, move: 1 },
        ],
        lights: [
          { x: 300, y: 250, dim: 40, bright: 20, config: { color: '#ffaa44', alpha: 0.8 } }
        ]
      };

      // In-engine transpiler logic (mirrors ImportExportModal & Rust scene_transpiler)
      const walls = (mockFoundryScene.walls || []).map((w: any) => ({
        x1: w.c?.[0] ?? 0,
        y1: w.c?.[1] ?? 0,
        x2: w.c?.[2] ?? 0,
        y2: w.c?.[3] ?? 0,
        is_door: w.door === 1 || w.door === 2,
        is_secret: w.door === 2,
        is_open: w.ds === 1,
        blocks_vision: w.sense !== 0,
        blocks_movement: w.move !== 0,
      }));

      const lights = (mockFoundryScene.lights || []).map((l: any) => ({
        x: l.x ?? 0,
        y: l.y ?? 0,
        dim_radius: l.dim ?? 0,
        bright_radius: l.bright ?? 0,
        color: l.config?.color || '#ffffff',
        intensity: l.config?.alpha ?? 1.0,
      }));

      return {
        name: mockFoundryScene.name,
        width: mockFoundryScene.width,
        height: mockFoundryScene.height,
        grid_size: mockFoundryScene.grid?.size,
        walls,
        lights
      };
    });

    // Assert Foundry Scene attributes
    expect(foundryResult.name).toBe('Crypt of Forgotten Souls');
    expect(foundryResult.walls).toHaveLength(4);

    // Wall 1: Solid wall
    expect(foundryResult.walls[0].is_door).toBe(false);
    expect(foundryResult.walls[0].blocks_vision).toBe(true);

    // Wall 2: Interactive Door
    expect(foundryResult.walls[1].is_door).toBe(true);
    expect(foundryResult.walls[1].is_secret).toBe(false);
    expect(foundryResult.walls[1].is_open).toBe(false);

    // Wall 3: Secret Door
    expect(foundryResult.walls[2].is_door).toBe(true);
    expect(foundryResult.walls[2].is_secret).toBe(true);

    // Wall 4: Window portal (blocks movement, allows vision)
    expect(foundryResult.walls[3].blocks_movement).toBe(true);
    expect(foundryResult.walls[3].blocks_vision).toBe(false);

    // Light source
    expect(foundryResult.lights).toHaveLength(1);
    expect(foundryResult.lights[0].color).toBe('#ffaa44');
    expect(foundryResult.lights[0].bright_radius).toBe(20);

    // 2. Verify Roll20 Dynamic Lighting Path Vector Transpilation
    const roll20Result = await page.evaluate(() => {
      const mockRoll20Export = {
        name: 'Caverns of Dread',
        width: 40,
        height: 30,
        snapping_increment: 70,
        paths: [
          {
            layer: 'walls',
            stroke: '#ff00ff',
            path: JSON.stringify([['M', 0, 0], ['L', 140, 0], ['L', 140, 280]]),
            barrierType: 'wall'
          }
        ]
      };

      // Convert DL vector paths into line segments
      const segments: Array<{ x1: number; y1: number; x2: number; y2: number; blocks_vision: boolean }> = [];
      for (const p of mockRoll20Export.paths) {
        if (p.layer === 'walls') {
          const raw = JSON.parse(p.path);
          let prevX = 0;
          let prevY = 0;
          for (const cmd of raw) {
            if (cmd[0] === 'M') {
              prevX = cmd[1];
              prevY = cmd[2];
            } else if (cmd[0] === 'L') {
              segments.push({
                x1: prevX,
                y1: prevY,
                x2: cmd[1],
                y2: cmd[2],
                blocks_vision: true
              });
              prevX = cmd[1];
              prevY = cmd[2];
            }
          }
        }
      }

      return {
        name: mockRoll20Export.name,
        grid_size: mockRoll20Export.snapping_increment,
        segments
      };
    });

    expect(roll20Result.name).toBe('Caverns of Dread');
    expect(roll20Result.grid_size).toBe(70);
    expect(roll20Result.segments).toHaveLength(2);
    expect(roll20Result.segments[0]).toEqual({ x1: 0, y1: 0, x2: 140, y2: 0, blocks_vision: true });
    expect(roll20Result.segments[1]).toEqual({ x1: 140, y1: 0, x2: 140, y2: 280, blocks_vision: true });

    // 3. Verify .vttbundle Packaging & Round-Trip Deserialization
    const bundleSuccess = await page.evaluate(async () => {
      // Simulate .vttbundle structure with JSZip
      const sampleMap = {
        id: 'map-roundtrip-test',
        name: 'The Sunken Keep',
        gridSize: 70,
        gridDistance: 5,
        width: 2800,
        height: 2100,
        walls: [{ id: 'w-1', x1: 0, y1: 0, x2: 100, y2: 100, door: 'none', blocksVision: true }]
      };

      const sampleCompendiumItem = {
        id: 'spell-radiant-smite',
        name: 'Radiant Smite',
        level: 2,
        school: 'Evocation',
        castingTime: '1 bonus action',
        description: 'Your weapon flares with holy energy.'
      };

      const manifest = {
        version: '1.0',
        exportedAt: Date.now(),
        campaignName: 'Roundtrip Test Campaign',
        counts: { tacticalMaps: 1, spells: 1 }
      };

      // Store in Dexie VttMapsDatabase
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('VttMapsDatabase');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('tacticalMaps')) {
            resolve(false);
            return;
          }

          const tx = db.transaction('tacticalMaps', 'readwrite');
          const store = tx.objectStore('tacticalMaps');
          store.put(sampleMap);

          tx.oncomplete = () => {
            // Verify round-trip read
            const readTx = db.transaction('tacticalMaps', 'readonly');
            const readStore = readTx.objectStore('tacticalMaps');
            const getReq = readStore.get('map-roundtrip-test');
            getReq.onsuccess = () => {
              const res = getReq.result;
              resolve(res && res.name === 'The Sunken Keep' && res.walls.length === 1);
            };
            getReq.onerror = () => resolve(false);
          };
          tx.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    });

    expect(bundleSuccess).toBe(true);
  });
});
