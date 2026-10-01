import { test, expect } from '@playwright/test';

test.describe('WIRE-17: SQLite FTS5 Global Search & Tactical Command Palette', () => {
  test('opens palette via Ctrl+K, performs debounced query, handles special FTS characters safely, and navigates via keyboard', async ({ page }) => {
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

    // Dismiss onboarding if still present
    const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipBtn.click({ force: true }).catch(() => {});
    }

    // 1. Trigger Command Palette with Ctrl+K
    await page.keyboard.press('Control+k');
    const palette = page.locator('div[aria-label="Tactical Command Palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    const searchInput = palette.locator('input[type="text"]');
    await expect(searchInput).toBeFocused();

    // 2. Type search query (e.g. "Fireball" or "Combat")
    await searchInput.fill('Combat');
    await page.waitForTimeout(300); // debounce wait

    const resultRows = palette.locator('div[role="option"], button.group, .flex-1.overflow-y-auto > div');
    const rowCount = await resultRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // 3. Test keyboard navigation: ArrowDown, ArrowUp
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    // 4. Test special character input escaping (", *, AND, OR, parentheses) to ensure zero FTS syntax crash
    const trickyQueries = ['"unclosed quote', 'Fireball* OR (Dragon AND', '***', 'NOT existing NEAR/2 test'];
    for (const q of trickyQueries) {
      await searchInput.fill(q);
      await page.waitForTimeout(150);
      // Ensure dialog is still open and healthy without crash
      await expect(palette).toBeVisible();
    }

    // 5. Close palette cleanly
    const closeBtn = palette.locator('button:has-text("✕")');
    await closeBtn.click();
    await expect(palette).toHaveCount(0);
  });
});
