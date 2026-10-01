import { test, expect } from '@playwright/test';

test.describe('WIRE-19: Quest DAG State Engine & Branching Workflow', () => {
  test('opens QuestTrackerModal, visualizes graph nodes, and verifies prerequisite unlocking and mutually exclusive branch failure', async ({ page }) => {
    test.setTimeout(60000);
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    await page.addInitScript(() => {
      localStorage.setItem('vtt_wizard_completed', 'true');
      localStorage.setItem('graywood_wizard_completed', 'true');
      localStorage.setItem('vtt_setup_completed', 'true');
      localStorage.setItem('vtt_setup_complete', 'true');
      localStorage.setItem('hasCompletedWizard', 'true');
      localStorage.setItem('graywood_setup_dismissed', 'true');
      localStorage.removeItem('vtt_campaign_quest_dag');
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Open Quest Tracker via custom event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vtt:open-quests'));
    });

    const modal = page.locator('div[aria-label="Quest Dependency Graph"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify starter quest nodes rendered
    const arrivalCard = modal.locator('.node-card:has-text("Arrival in Graywood")');
    await expect(arrivalCard).toBeVisible();
    await expect(arrivalCard).toHaveClass(/active/);

    const investigationCard = modal.locator('.node-card:has-text("Shadows in the Weald")');
    await expect(investigationCard).toBeVisible();
    await expect(investigationCard).toHaveClass(/locked/);

    // 1. Select root objective ("Arrival in Graywood") and complete it
    await arrivalCard.click();
    const completeBtn = modal.locator('button.state-btn.complete');
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // 2. Assert Arrival in Graywood transitioned to completed
    await expect(arrivalCard).toHaveClass(/completed/);

    // 3. Assert downstream dependent objective automatically unlocked from locked to active
    await expect(investigationCard).toHaveClass(/active/);

    // 4. Complete "Shadows in the Weald" to unlock branching paths (Infiltrate vs Parley)
    await investigationCard.click();
    await completeBtn.click();
    await expect(investigationCard).toHaveClass(/completed/);

    const infiltrateCard = modal.locator('.node-card:has-text("Midnight Infiltration")');
    const parleyCard = modal.locator('.node-card:has-text("Diplomatic Envoy")');
    await expect(infiltrateCard).toHaveClass(/active/);
    await expect(parleyCard).toHaveClass(/active/);

    // 5. Complete "Midnight Infiltration" and verify mutually exclusive "Diplomatic Envoy" transitions to failed
    await infiltrateCard.click();
    await completeBtn.click();
    await expect(infiltrateCard).toHaveClass(/completed/);
    await expect(parleyCard).toHaveClass(/failed/);

    // 6. Close QuestTrackerModal cleanly
    const closeBtn = modal.locator('button.close-btn');
    await closeBtn.click();
    await expect(modal).toHaveCount(0);
  });
});
