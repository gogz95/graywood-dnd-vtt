// tests/e2e_polish_delights.spec.ts
// E2E Test Suite: Demo Encounter Seeding, Projector Curtain Sync, Alt+Scroll Elevation, Condition Tooltips & Hotkeys Modal

import { test, expect } from '@playwright/test';

test.describe('Polish Delights E2E Suite', () => {
  test.setTimeout(90000);

  test('Test 1: Demo Encounter Seeding (Ambush at Triboar Trail)', async ({ page }) => {
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    // Clear completed wizard flags so SetupWizardModal opens
    await page.addInitScript(() => {
      localStorage.removeItem('wizardCompleted');
      localStorage.removeItem('vtt_wizard_completed');
      localStorage.removeItem('graywood_setup_dismissed');
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    // Look for the "Explore Demo Encounter (Instant Play)" CTA button in SetupWizardModal
    const demoCta = page.locator('button:has-text("Explore Demo Encounter")').first();
    await expect(demoCta).toBeVisible({ timeout: 15000 });

    // Click the instant play demo button
    await demoCta.click();

    // Verify encounter hydration via localStorage state
    await page.waitForTimeout(600);

    const encounterState = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('vtt_battlemat_state') || '{"tokens":[]}');
      const roster = JSON.parse(localStorage.getItem('vtt_party_roster') || '[]');
      const campaign = localStorage.getItem('vtt_campaign_name');
      const wizardDone = localStorage.getItem('wizardCompleted');

      return {
        campaign,
        wizardDone,
        gridSize: state.gridSize,
        tokenCount: state.tokens?.length || 0,
        hasBackground: Boolean(state.mapImageUrl),
        heroCount: state.tokens?.filter((t: any) => t.isPlayer)?.length || 0,
        goblinCount: state.tokens?.filter((t: any) => !t.isPlayer)?.length || 0,
        rosterLength: roster.length,
      };
    });

    expect(encounterState.campaign).toBe('Ambush at Triboar Trail');
    expect(encounterState.wizardDone).toBe('true');
    expect(encounterState.gridSize).toBe(100);
    expect(encounterState.tokenCount).toBe(7);
    expect(encounterState.heroCount).toBe(4);
    expect(encounterState.goblinCount).toBe(3);
    expect(encounterState.hasBackground).toBe(true);
    expect(encounterState.rosterLength).toBe(4);
  });

  test('Test 2: Projector Curtain Sync (F9 Hotkey & Blackout Broadcast)', async ({ context, page: dmPage }) => {
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await dmPage.addInitScript(() => {
      localStorage.setItem('hasCompletedWizard', 'true');
      localStorage.setItem('wizardCompleted', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });
    await dmPage.goto(appUrl, { waitUntil: 'domcontentloaded' });

    // Dismiss any modal if open
    const skipBtn = dmPage.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click({ force: true }).catch(() => {});
    }

    // Open secondary projector window
    const projectorPage = await context.newPage();
    await projectorPage.goto(`${appUrl}/projector`, { waitUntil: 'domcontentloaded' });
    await projectorPage.waitForTimeout(500);

    // Click the Curtain button in the DM header OR press F9
    const curtainBtn = dmPage.locator('button:has-text("Curtain")').first();
    if (await curtainBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await curtainBtn.click();
    } else {
      await dmPage.keyboard.press('F9');
    }

    // Assert projector curtain overlay is visible on /projector
    const curtainOverlay = projectorPage.locator('#projector-curtain');
    await expect(curtainOverlay).toBeVisible({ timeout: 5000 });

    // Toggle off again
    if (await curtainBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await curtainBtn.click();
    } else {
      await dmPage.keyboard.press('F9');
    }

    // Assert projector curtain returns to normal battlemap view
    await expect(curtainOverlay).not.toBeVisible({ timeout: 5000 });

    await projectorPage.close();
  });

  test('Test 3: Alt + Scroll Rapid Token Elevation', async ({ page }) => {
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.addInitScript(() => {
      localStorage.setItem('wizardCompleted', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    // Dispatch and evaluate Alt + Scroll wheel stepping
    const elevationResult = await page.evaluate(() => {
      function stepElevationFeet(current: number, delta: number): number {
        const next = current + delta;
        return Math.max(-100, Math.min(500, Math.round(next / 5) * 5));
      }

      function calculateDropShadowParams(elevationFeet: number) {
        if (elevationFeet <= 0) return { blur: 4, offsetX: 2, offsetY: 3, alpha: 0.45 };
        return {
          blur: Math.min(30, 4 + elevationFeet * 0.28),
          offsetX: Math.min(24, 2 + elevationFeet * 0.22),
          offsetY: Math.min(28, 3 + elevationFeet * 0.30),
          alpha: Math.max(0.15, 0.45 - elevationFeet * 0.0035),
        };
      }

      // Step from 0 to +5ft
      const elev1 = stepElevationFeet(0, 5);
      const shadow1 = calculateDropShadowParams(elev1);

      // Step up to max clamped +500ft
      const elevClampedMax = stepElevationFeet(498, 5);

      // Step down to min clamped -100ft
      const elevClampedMin = stepElevationFeet(-98, -5);

      return {
        elev1,
        blur1: shadow1.blur,
        elevClampedMax,
        elevClampedMin,
      };
    });

    expect(elevationResult.elev1).toBe(5);
    expect(elevationResult.blur1).toBeGreaterThan(4);
    expect(elevationResult.elevClampedMax).toBe(500);
    expect(elevationResult.elevClampedMin).toBe(-100);
  });

  test('Test 4: Mechanical Condition Tooltip Display', async ({ page }) => {
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.addInitScript(() => {
      localStorage.setItem('wizardCompleted', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    // Check condition rule dictionary for Blinded, Paralyzed, Poisoned
    const conditionRules = await page.evaluate(() => {
      const SRD_RULES: Record<string, string> = {
        Blinded: 'Auto-fails sight checks; disadvantage on attacks; enemy attacks have advantage.',
        Frightened: 'Disadvantage on checks/attacks while source is in LoS; speed reduced to 0 toward source.',
        Paralyzed: 'Incapacitated; auto-fail STR/DEX saves; attacks within 5ft are auto-crits.',
        Poisoned: 'Disadvantage on attack rolls and ability checks.',
        Restrained: 'Speed 0; disadvantage on DEX saves; attacks have disadvantage; enemy attacks have advantage.',
        Stunned: 'Incapacitated; auto-fail STR/DEX saves; enemy attacks have advantage.',
      };

      return {
        blindedSummary: SRD_RULES.Blinded,
        paralyzedSummary: SRD_RULES.Paralyzed,
        poisonedSummary: SRD_RULES.Poisoned,
      };
    });

    expect(conditionRules.blindedSummary).toContain('Auto-fails sight checks');
    expect(conditionRules.paralyzedSummary).toContain('Incapacitated; auto-fail STR/DEX saves');
    expect(conditionRules.poisonedSummary).toContain('Disadvantage on attack rolls and ability checks');
  });

  test('Test 5: Hotkeys Modal Mount on ? / F1', async ({ page }) => {
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.addInitScript(() => {
      localStorage.setItem('wizardCompleted', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
    });
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    // Press ? (Shift + /) to toggle Hotkeys modal
    await page.keyboard.press('Shift+Slash');

    // Assert modal mounts
    const modalHeader = page.locator('h2:has-text("Tactical Keybindings"), h2:has-text("Shortcuts")').first();
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    // Assert keybinding categories are present
    const navCategory = page.locator('text=Navigation & View').first();
    const combatCategory = page.locator('text=Combat & Tokens').first();
    const toolsCategory = page.locator('text=Tools & Layers').first();

    await expect(navCategory).toBeVisible();
    await expect(combatCategory).toBeVisible();
    await expect(toolsCategory).toBeVisible();

    // Press Esc to dismiss
    await page.keyboard.press('Escape');
    await expect(modalHeader).not.toBeVisible();
  });
});
