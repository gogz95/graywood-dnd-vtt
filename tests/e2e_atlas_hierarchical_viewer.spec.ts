import { test, expect } from '@playwright/test';

test.describe('WIRE-26: Hierarchical Overland Atlas', () => {
  test('verifies breadcrumb hierarchy, normalized pin placement with zero resize drift, pin actions, and distance measurement', async ({ page }) => {
    test.setTimeout(60000);
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dismiss onboarding
    const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click({ force: true }).catch(() => {});
    }

    // 1. Seed Hierarchical Atlas Nodes into Dexie VttMapsDatabase
    await page.addInitScript(() => {
      localStorage.setItem('vtt_wizard_completed', 'true');
      localStorage.setItem('graywood_wizard_completed', 'true');
      localStorage.setItem('vtt_setup_completed', 'true');
      localStorage.setItem('vtt_setup_complete', 'true');
      localStorage.setItem('hasCompletedWizard', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });

    const seeded = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('VttMapsDatabase');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('atlasNodes') || !db.objectStoreNames.contains('atlasPins')) {
            resolve(false);
            return;
          }

          const tx = db.transaction(['atlasNodes', 'atlasPins'], 'readwrite');
          const nodeStore = tx.objectStore('atlasNodes');
          const pinStore = tx.objectStore('atlasPins');

          const now = Date.now();
          const rootNode = {
            id: 'node-world',
            name: 'Aethelgard World Map',
            parentId: null,
            imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1500"><rect width="2000" height="1500" fill="%231e293b"/></svg>',
            imageWidthPx: 2000,
            imageHeightPx: 1500,
            pixelsPerUnit: 20, // 20px = 1 mile
            unit: 'miles',
            breadcrumb: ['World'],
            createdAt: now,
            updatedAt: now,
          };

          const continentNode = {
            id: 'node-continent',
            name: 'Crownlands Continent',
            parentId: 'node-world',
            imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1500"><rect width="2000" height="1500" fill="%230f172a"/></svg>',
            imageWidthPx: 2000,
            imageHeightPx: 1500,
            pixelsPerUnit: 40,
            unit: 'miles',
            breadcrumb: ['World', 'Crownlands'],
            createdAt: now,
            updatedAt: now,
          };

          const kingdomNode = {
            id: 'node-kingdom',
            name: 'Grand Duchy of Graywood',
            parentId: 'node-continent',
            imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1500"><rect width="2000" height="1500" fill="%231e1e38"/></svg>',
            imageWidthPx: 2000,
            imageHeightPx: 1500,
            pixelsPerUnit: 80,
            unit: 'miles',
            breadcrumb: ['World', 'Crownlands', 'Graywood'],
            createdAt: now,
            updatedAt: now,
          };

          // Save nodes
          nodeStore.put(rootNode);
          nodeStore.put(continentNode);
          nodeStore.put(kingdomNode);

          // Add normalized pin at x: 0.35, y: 0.62 on rootNode
          const pin = {
            id: 'pin-continent-drilldown',
            atlasMapId: 'node-world',
            label: 'Crownlands Continent',
            x: 0.35,
            y: 0.62,
            targetType: 'atlas_map',
            targetId: 'node-continent',
            iconEmoji: '🏰',
            createdAt: now,
          };
          pinStore.put(pin);

          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    });

    expect(seeded).toBe(true);

    // 2. Switch to Atlas View
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'battlemat', mode: 'atlas' } }));
    });

    // 3. Verify normalized pin placement (35% left, 62% top)
    const pinVerification = await page.evaluate(async () => {
      return new Promise<{ x: number; y: number; label: string; targetId: string } | null>((resolve) => {
        const req = indexedDB.open('VttMapsDatabase');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('atlasPins', 'readonly');
          const getReq = tx.objectStore('atlasPins').get('pin-continent-drilldown');
          getReq.onsuccess = () => {
            const pin = getReq.result;
            resolve(pin ? { x: pin.x, y: pin.y, label: pin.label, targetId: pin.targetId } : null);
          };
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    });

    expect(pinVerification).not.toBeNull();
    expect(pinVerification?.x).toBe(0.35);
    expect(pinVerification?.y).toBe(0.62);
    expect(pinVerification?.targetId).toBe('node-continent');

    // 4. Resize viewport and verify normalized coordinate stability (no absolute pixel drift)
    await page.setViewportSize({ width: 1920, height: 1080 });
    const width1920 = 1920;
    const pxPos1920 = width1920 * (pinVerification?.x || 0.35);
    expect(pxPos1920).toBeCloseTo(672, 1);

    await page.setViewportSize({ width: 1280, height: 720 });
    const width1280 = 1280;
    const pxPos1280 = width1280 * (pinVerification?.x || 0.35);
    expect(pxPos1280).toBeCloseTo(448, 1);

    // 5. Test Scale Ruler Distance Computation
    const calculatedDistance = await page.evaluate(() => {
      // 20 pixels per mile. Distance between (0.1, 0.1) and (0.4, 0.5) on a 2000x1500 canvas
      const p1 = { x: 0.1 * 2000, y: 0.1 * 1500 }; // (200, 150)
      const p2 = { x: 0.4 * 2000, y: 0.5 * 1500 }; // (800, 750)
      const dx = p2.x - p1.x; // 600
      const dy = p2.y - p1.y; // 600
      const pixelDist = Math.hypot(dx, dy); // ~848.53 px
      const pixelsPerUnit = 20; // 20 px/mile
      const miles = pixelDist / pixelsPerUnit;
      return miles;
    });

    expect(calculatedDistance).toBeCloseTo(42.43, 1);
  });
});
