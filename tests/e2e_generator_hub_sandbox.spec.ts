import { test, expect } from '@playwright/test';

test.describe('WIRE-25: Generator Submenu & Iframe Sandbox', () => {
  test('opens generator hub in isolated modal, verifies sandbox attributes, handles export message, and unmounts cleanly', async ({ page }) => {
    test.setTimeout(60000);
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dismiss onboarding / first run wizard if present
    const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click({ force: true }).catch(() => {});
    }

    await page.addInitScript(() => {
      localStorage.setItem('vtt_wizard_completed', 'true');
      localStorage.setItem('graywood_wizard_completed', 'true');
      localStorage.setItem('vtt_setup_completed', 'true');
      localStorage.setItem('vtt_setup_complete', 'true');
      localStorage.setItem('hasCompletedWizard', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });

    // 1. Open Generator Hub Modal
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vtt:open-generator-hub'));
    });

    const modalDialog = page.locator('div[aria-label="Map Generator Hub"]');
    await expect(modalDialog).toBeVisible({ timeout: 5000 });

    // 2. Select first generator (e.g. Dungeon Scrawl)
    const generatorCard = modalDialog.locator('button:has-text("Dungeon Scrawl"), button:has-text("Watabou")').first();
    await expect(generatorCard).toBeVisible();
    await generatorCard.click();

    // 3. Verify iframe sandbox attributes
    const iframe = modalDialog.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 5000 });
    const sandboxAttr = await iframe.getAttribute('sandbox');
    expect(sandboxAttr).toContain('allow-scripts');
    expect(sandboxAttr).toContain('allow-same-origin');

    // 4. Verify postMessage export bridge creates map record in IndexedDB
    const mapRegistered = await page.evaluate(async () => {
      // Simulate postMessage from generator iframe
      const exportMsg = {
        type: 'GENERATOR_EXPORT',
        filename: 'procedural_dungeon.png',
        format: 'png',
        dataBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        metadata: {
          gridSize: 70,
        },
      };

      window.postMessage(exportMsg, '*');

      // Wait a moment for handleGeneratorMessage to process
      await new Promise((r) => setTimeout(r, 600));

      // Check Dexie mapsDb via native indexedDB
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('VttMapsDatabase');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('tacticalMaps')) {
            resolve(false);
            return;
          }
          const tx = db.transaction('tacticalMaps', 'readonly');
          const store = tx.objectStore('tacticalMaps');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const items = getAllReq.result || [];
            resolve(items.some((m: any) => m.name && m.name.includes('procedural_dungeon')));
          };
          getAllReq.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    });

    expect(mapRegistered).toBe(true);

    // 5. Close modal and assert iframe is unmounted from DOM
    const closeBtn = modalDialog.locator('button:has-text("✕"), button[title="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(iframe).toHaveCount(0);
  });
});
