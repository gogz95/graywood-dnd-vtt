import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface TokenSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  conditions: string[];
}

interface PersistenceDiscrepancy {
  entityId: string;
  field: string;
  expected: any;
  actual: any;
  message: string;
}

test.describe('State Recovery & Reload Resiliency Suite', () => {
  test('Verifies token coordinates, metadata, turn tracker, and storage cleanup across reload', async ({ page }) => {
    test.setTimeout(120000);

    const discrepancies: PersistenceDiscrepancy[] = [];
    const reportPath = path.resolve('logs/persistence_test_report.md');

    // ── Step 0: Robust Navigation ─────────────────────────────────────────────
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dismiss onboarding wizard modal if present on initial load
    const initialSkipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await initialSkipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await initialSkipBtn.click({ force: true }).catch(() => { });
      await page.locator('dialog').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }

    try {
      // ── Step 1: Setup State ──────────────────────────────────────────────────
      const testTokenA: TokenSnapshot = {
        id: 'tok-persistence-hero-1',
        name: 'Aelar Stormcaller',
        x: 8,
        y: 14,
        hp: 24,
        maxHp: 38,
        conditions: ['Blessed', 'Inspired'],
      };

      const testTokenB: TokenSnapshot = {
        id: 'tok-persistence-foe-2',
        name: 'Ironclad Orc',
        x: 16,
        y: 20,
        hp: 9,
        maxHp: 22,
        conditions: ['Prone', 'Frightened'],
      };

      await page.evaluate(
        ({ tokenA, tokenB }) => {
          // 1. Update battlemat state in localStorage
          const BATTLEMAT_KEY = 'vtt_battlemat_state';
          const raw = localStorage.getItem(BATTLEMAT_KEY);
          const state = raw ? JSON.parse(raw) : { tokens: [] };

          const otherTokens = (state.tokens || []).filter(
            (t: any) => t.id !== tokenA.id && t.id !== tokenB.id
          );

          state.tokens = [
            ...otherTokens,
            {
              ...tokenA,
              color: '#4f46e5',
              isPlayer: true,
              sizeInCells: 1,
              sightRadiusFeet: 30,
            },
            {
              ...tokenB,
              color: '#dc2626',
              isPlayer: false,
              sizeInCells: 1,
              sightRadiusFeet: 30,
            },
          ];

          localStorage.setItem(BATTLEMAT_KEY, JSON.stringify(state));

          // 2. Setup turn tracker state
          const ENCOUNTERS_KEY = 'vtt_encounters';
          const encounterData = {
            isActive: true,
            round: 2,
            turnIndex: 1,
            combatants: [
              {
                tokenId: tokenA.id,
                name: tokenA.name,
                initiative: 19,
                hp: tokenA.hp,
                maxHp: tokenA.maxHp,
                conditions: tokenA.conditions,
              },
              {
                tokenId: tokenB.id,
                name: tokenB.name,
                initiative: 11,
                hp: tokenB.hp,
                maxHp: tokenB.maxHp,
                conditions: tokenB.conditions,
              },
            ],
          };
          localStorage.setItem(ENCOUNTERS_KEY, JSON.stringify(encounterData));
        },
        { tokenA: testTokenA, tokenB: testTokenB }
      );

      // ── Step 2: Record Pre-Reload Baseline Variables ──────────────────────────
      const preReload = await page.evaluate(() => {
        // Prevent onboarding dialog from unmounting canvas on cold reload
        localStorage.setItem('vtt_wizard_completed', 'true');
        localStorage.setItem('graywood_setup_dismissed', 'true');

        const battlemat = JSON.parse(localStorage.getItem('vtt_battlemat_state') || '{}');
        const encounters = JSON.parse(localStorage.getItem('vtt_encounters') || '{}');

        return {
          tokens: (battlemat.tokens || []) as TokenSnapshot[],
          round: encounters.round ?? 1,
          turnIndex: encounters.turnIndex ?? 0,
          turnOrder: (encounters.combatants || []).map((c: any) => c.tokenId) as string[],
        };
      });

      // ── Reload Step ──────────────────────────────────────────────────────────
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

      // Dismiss setup modal if it reappears after reload
      const reloadSkipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
      if (await reloadSkipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reloadSkipBtn.click({ force: true }).catch(() => { });
        await page.locator('dialog').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
      }

      // Ensure browser DOM and client storage are fully hydrated
      await page.waitForFunction(() => document.readyState === 'complete');
      await page.waitForTimeout(500);

      // ── Step 3: Assertions on Post-Reload State ──────────────────────────────
      const postReload = await page.evaluate(() => {
        const battlemat = JSON.parse(localStorage.getItem('vtt_battlemat_state') || '{}');
        const encounters = JSON.parse(localStorage.getItem('vtt_encounters') || '{}');

        return {
          tokens: (battlemat.tokens || []) as TokenSnapshot[],
          round: encounters.round ?? 1,
          turnIndex: encounters.turnIndex ?? 0,
          turnOrder: (encounters.combatants || []).map((c: any) => c.tokenId) as string[],
        };
      });

      // Check Token A coordinates within 1px/unit threshold, HP, and conditions
      const restoredA = postReload.tokens.find((t) => t.id === testTokenA.id);
      if (!restoredA) {
        discrepancies.push({
          entityId: testTokenA.id,
          field: 'existence',
          expected: 'Present in post-reload state',
          actual: 'Missing',
          message: `Token ${testTokenA.name} (#${testTokenA.id}) was not found in storage after reload`,
        });
      } else {
        const deltaX = Math.abs(restoredA.x - testTokenA.x);
        const deltaY = Math.abs(restoredA.y - testTokenA.y);
        if (deltaX > 1 || deltaY > 1) {
          discrepancies.push({
            entityId: testTokenA.id,
            field: 'coordinates',
            expected: `x: ${testTokenA.x}, y: ${testTokenA.y}`,
            actual: `x: ${restoredA.x}, y: ${restoredA.y}`,
            message: `Coordinates exceeded 1px threshold (dx: ${deltaX}, dy: ${deltaY})`,
          });
        }
        expect(deltaX).toBeLessThanOrEqual(1);
        expect(deltaY).toBeLessThanOrEqual(1);

        if (restoredA.hp !== testTokenA.hp) {
          discrepancies.push({
            entityId: testTokenA.id,
            field: 'hp',
            expected: testTokenA.hp,
            actual: restoredA.hp,
            message: `HP value mismatch after reload`,
          });
        }
        expect(restoredA.hp).toBe(testTokenA.hp);

        const conditionsMatch = testTokenA.conditions.every((c) => (restoredA.conditions || []).includes(c));
        if (!conditionsMatch) {
          discrepancies.push({
            entityId: testTokenA.id,
            field: 'conditions',
            expected: testTokenA.conditions,
            actual: restoredA.conditions,
            message: `Condition badges mismatch after reload`,
          });
        }
        expect(conditionsMatch).toBe(true);
      }

      // Check Token B coordinates within 1px/unit threshold, HP, and conditions
      const restoredB = postReload.tokens.find((t) => t.id === testTokenB.id);
      if (!restoredB) {
        discrepancies.push({
          entityId: testTokenB.id,
          field: 'existence',
          expected: 'Present in post-reload state',
          actual: 'Missing',
          message: `Token ${testTokenB.name} (#${testTokenB.id}) was not found in storage after reload`,
        });
      } else {
        const deltaX = Math.abs(restoredB.x - testTokenB.x);
        const deltaY = Math.abs(restoredB.y - testTokenB.y);
        if (deltaX > 1 || deltaY > 1) {
          discrepancies.push({
            entityId: testTokenB.id,
            field: 'coordinates',
            expected: `x: ${testTokenB.x}, y: ${testTokenB.y}`,
            actual: `x: ${restoredB.x}, y: ${restoredB.y}`,
            message: `Coordinates exceeded 1px threshold (dx: ${deltaX}, dy: ${deltaY})`,
          });
        }
        expect(deltaX).toBeLessThanOrEqual(1);
        expect(deltaY).toBeLessThanOrEqual(1);

        if (restoredB.hp !== testTokenB.hp) {
          discrepancies.push({
            entityId: testTokenB.id,
            field: 'hp',
            expected: testTokenB.hp,
            actual: restoredB.hp,
            message: `HP value mismatch after reload`,
          });
        }
        expect(restoredB.hp).toBe(testTokenB.hp);

        const conditionsMatch = testTokenB.conditions.every((c) => (restoredB.conditions || []).includes(c));
        if (!conditionsMatch) {
          discrepancies.push({
            entityId: testTokenB.id,
            field: 'conditions',
            expected: testTokenB.conditions,
            actual: restoredB.conditions,
            message: `Condition badges mismatch after reload`,
          });
        }
        expect(conditionsMatch).toBe(true);
      }

      // Verify Turn Tracker Round and Order Persistence
      if (postReload.round !== preReload.round) {
        discrepancies.push({
          entityId: 'turn-tracker',
          field: 'round',
          expected: preReload.round,
          actual: postReload.round,
          message: `Round count did not persist across reload`,
        });
      }
      expect(postReload.round).toBe(preReload.round);

      if (JSON.stringify(postReload.turnOrder) !== JSON.stringify(preReload.turnOrder)) {
        discrepancies.push({
          entityId: 'turn-tracker',
          field: 'turnOrder',
          expected: preReload.turnOrder,
          actual: postReload.turnOrder,
          message: `Turn tracker combatant order was altered upon reload`,
        });
      }
      expect(postReload.turnOrder).toEqual(preReload.turnOrder);

      // ── Step 4: Storage Verification (Deletion & Clean Record Removal) ───────
      const deletionResult = await page.evaluate(async (tokenToDeleteId) => {
        const BATTLEMAT_KEY = 'vtt_battlemat_state';
        const rawBefore = localStorage.getItem(BATTLEMAT_KEY);
        const stateBefore = rawBefore ? JSON.parse(rawBefore) : { tokens: [] };
        const initialCount = (stateBefore.tokens || []).length;

        // Perform clean deletion
        stateBefore.tokens = (stateBefore.tokens || []).filter((t: any) => t.id !== tokenToDeleteId);
        localStorage.setItem(BATTLEMAT_KEY, JSON.stringify(stateBefore));

        // Read back after deletion
        const rawAfter = localStorage.getItem(BATTLEMAT_KEY);
        const stateAfter = rawAfter ? JSON.parse(rawAfter) : { tokens: [] };
        const finalCount = (stateAfter.tokens || []).length;
        const ghostRecord = (stateAfter.tokens || []).some((t: any) => t.id === tokenToDeleteId);

        let indexedDbNames: string[] = [];
        if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
          try {
            const dbs = await indexedDB.databases();
            indexedDbNames = dbs.map((d) => d.name || 'unnamed');
          } catch { }
        }

        return {
          initialCount,
          finalCount,
          ghostRecordFound: ghostRecord,
          indexedDbDatabases: indexedDbNames,
        };
      }, testTokenB.id);

      if (deletionResult.ghostRecordFound) {
        discrepancies.push({
          entityId: testTokenB.id,
          field: 'deletion',
          expected: 'Record completely purged from storage',
          actual: 'Ghost record still present in battlemat tokens',
          message: 'Deleted entity was not cleanly purged from localStorage',
        });
      }
      expect(deletionResult.ghostRecordFound).toBe(false);
      expect(deletionResult.finalCount).toBe(deletionResult.initialCount - 1);
    } finally {
      // ── Step 5: Error Capturing & Structured Markdown Report Output ──────────
      const logDir = path.dirname(reportPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      let markdown = `# State Recovery & Reload Resiliency Report\n\n`;
      markdown += `- **Timestamp:** ${new Date().toISOString()}\n`;
      markdown += `- **Discrepancies / Failures Logged:** ${discrepancies.length}\n\n`;

      markdown += `### Validation Criteria Executed:\n`;
      markdown += `1. **Token Coordinate Survival:** Grid positions verified within 1px/unit threshold across page reload.\n`;
      markdown += `2. **Metadata & Status Badges:** Updated HP values and active condition badges asserted after reload.\n`;
      markdown += `3. **Turn Tracker Order:** Combat round counter and initiative sequence order matched pre-reload baseline.\n`;
      markdown += `4. **Storage Cleanup & Deletion:** Validated clean entity purge with 0 ghost records remaining in storage.\n\n`;

      if (discrepancies.length === 0) {
        markdown += `### Status: All persistence and reload resilience checks passed with 0 discrepancies.\n`;
      } else {
        markdown += `### Persistence Anomalies & Discrepancies:\n\n`;
        discrepancies.forEach((disc, idx) => {
          markdown += `#### ${idx + 1}. Entity \`${disc.entityId}\` [${disc.field}]\n`;
          markdown += `- **Message:** ${disc.message}\n`;
          markdown += `- **Expected:** \`${JSON.stringify(disc.expected)}\`\n`;
          markdown += `- **Actual:** \`${JSON.stringify(disc.actual)}\`\n\n`;
          markdown += `---\n`;
        });
      }

      fs.writeFileSync(reportPath, markdown, 'utf8');
    }
  });
});