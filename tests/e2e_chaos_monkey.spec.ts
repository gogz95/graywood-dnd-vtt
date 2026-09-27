import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface DefectEntry {
  scenario: string;
  type: string;
  message: string;
  stack?: string;
}

async function dispatchClickEvents(page: Page, btn: Locator, burstCount: number, intervalDelay: number) {
  const uncaughtRejections: string[] = [];
  for (let burstIdx = 0; burstIdx < burstCount; burstIdx++) {
    try {
      await btn.dispatchEvent('click');
    } catch (err: any) {
      uncaughtRejections.push(`Burst #${burstIdx}: ${err.message}`);
    }
    await page.waitForTimeout(intervalDelay);
  }
  return uncaughtRejections;
}

async function checkStateIntegrity(page: Page) {
  const stateIntegrity = await page.evaluate(() => {
    const failures: string[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (seenKeys.has(key)) {
        failures.push(`Duplicate localStorage key detected: ${key}`);
      }
      seenKeys.add(key);

      const value = localStorage.getItem(key);
      if (value && (value.startsWith('{') || value.startsWith('['))) {
        try {
          const parsed = JSON.parse(value);
          const checkNegative = (obj: any, path: string) => {
            if (typeof obj === 'number') {
              if (obj < 0 && (path.includes('hp') || path.includes('count') || path.includes('seconds'))) {
                failures.push(`Invalid negative value in ${key} at ${path}: ${obj}`);
              }
            } else if (typeof obj === 'object' && obj !== null) {
              for (const [k, v] of Object.entries(obj)) {
                checkNegative(v, `${path}.${k}`);
              }
            }
          };
          checkNegative(parsed, key);
        } catch (e: any) {
          failures.push(`Unparseable JSON in ${key}: ${e.message}`);
        }
      }
    }
    return failures;
  });
  return stateIntegrity;
}

test.describe('Chaos & Input Stress Testing Suite', () => {
  test('Executes erratic user behavior, race conditions, and interrupted pointer states', async ({ page }) => {
    test.setTimeout(120000);

    const defectLedger: DefectEntry[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // ── Setup Listeners ────────────────────────────────────────────────────────
    const onConsole = (msg: any) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        consoleErrors.push(text);
        defectLedger.push({
          scenario: 'Runtime Console',
          type: 'Console Error',
          message: text,
        });
      }
    };

    const onPageError = (exception: Error) => {
      pageErrors.push(exception.message);
      defectLedger.push({
        scenario: 'Runtime Uncaught',
        type: 'Uncaught Exception',
        message: exception.message,
        stack: exception.stack,
      });
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    // ── Injection for State & Viewport Telemetry ───────────────────────────────
    await page.addInitScript(() => {
      try {
        const OrigBC = window.BroadcastChannel;
        if (OrigBC) {
          window.BroadcastChannel = class extends OrigBC {
            constructor(channelName: string) {
              super(channelName);
              if (channelName === 'graywood_vtt_channel') {
                (window as any).__vttChannel = this;
              }
            }
            postMessage(msg: any) {
              if (msg && (msg.type === 'VIEWPORT_DM' || msg.type === 'VIEWPORT_PROJECTOR')) {
                (window as any).__latestVttViewport = msg.payload;
              }
              super.postMessage(msg);
            }
          };
        }
      } catch { }
    });

    try {
      // ── Step 0: Deterministic Navigation & Workspace Ready ───────────────────
      const appUrl = process.env.VTT_URL || 'http://localhost:5173';
      try {
        await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch {
        try {
          await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded', timeout: 5000 });
        } catch {
          await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 5000 });
        }
      }

      // Dismiss onboarding/setup modal if present
      const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click({ timeout: 1500, force: true }).catch(() => { });
        await expect(skipBtn).toBeHidden({ timeout: 5000 }).catch(() => { });
      }

      const canvasLocator = page.locator('canvas').first();
      await expect(canvasLocator).toBeVisible({ timeout: 10000 });

      // ── Step 1: Rapid-Fire Action Button Spamming ───────────────────────────
      // Targets dice triggers, turn progression, and quick token action buttons
      const buttonTargets = [
        page.locator('button:has-text("🎲"), button[title*="Dice"]').first(),
        page.locator('button[id*="time-advance-10m"], button:has-text("+10m")').first(),
        page.locator('button[id*="time-advance-1h"], button:has-text("+1h")').first(),
        page.locator('button:has-text("⚔️"), button[aria-label*="Melee"]').first(),
      ];

      for (const btn of buttonTargets) {
        if (!(await btn.isVisible().catch(() => false))) {
          continue;
        }

        const burstCount = 12; // 10–15 rapid sequential clicks
        const intervalDelay = 10; // ~120ms total execution window

        const uncaughtRejections = await dispatchClickEvents(page, btn, burstCount, intervalDelay);

        // Assert no uncaught click rejections during burst
        if (uncaughtRejections.length > 0) {
          defectLedger.push({
            scenario: 'Rapid-Fire Button Spam',
            type: 'Uncaught Rejections',
            message: `Button generated ${uncaughtRejections.length} click rejections: ${uncaughtRejections.join('; ')}`,
          });
        }
        expect(uncaughtRejections).toEqual([]);

        // Assert state integrity in storage: no corrupted keys, duplicate keys, or invalid negative numbers
        const stateIntegrity = await checkStateIntegrity(page);

        if (stateIntegrity.length > 0) {
          defectLedger.push({
            scenario: 'Rapid-Fire State Integrity',
            type: 'State Corruption',
            message: stateIntegrity.join(' | '),
          });
        }
        expect(stateIntegrity).toEqual([]);
      }

      // ── Step 2: Interrupted Pointer Interactions ────────────────────────────
      // Initiates token drag with pointerdown/pointermove, then dispatches Escape/blur before pointerup
      const canvasBox = await canvasLocator.boundingBox();
      if (canvasBox) {
        const startX = canvasBox.x + canvasBox.width * 0.45;
        const startY = canvasBox.y + canvasBox.height * 0.45;
        const dragTargetX = startX + 80;
        const dragTargetY = startY + 80;

        await page.mouse.move(startX, startY);
        await page.mouse.down({ button: 'left' });
        await page.mouse.move(dragTargetX, dragTargetY);

        // Abrupt interruption: Escape key and synthetic blur without mouseup
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
          window.dispatchEvent(new Event('blur'));
          document.dispatchEvent(new MouseEvent('mouseleave'));
        });

        // Assert pointer is not locked or frozen
        const pointerState = await page.evaluate(() => {
          return {
            isPointerLocked: document.pointerLockElement !== null,
            activeElementTag: document.activeElement?.tagName || 'NONE',
          };
        });

        if (pointerState.isPointerLocked) {
          defectLedger.push({
            scenario: 'Interrupted Pointer Interaction',
            type: 'Pointer Lock Leak',
            message: 'Pointer remained locked after Escape and blur interruption',
          });
        }
        expect(pointerState.isPointerLocked).toBe(false);

        // Verify canvas remains responsive after interruption
        await page.mouse.up({ button: 'left' });
        await page.mouse.move(startX + 10, startY + 10);
        await page.mouse.click(startX + 10, startY + 10).catch((err) => {
          defectLedger.push({
            scenario: 'Interrupted Pointer Interaction',
            type: 'Pointer Freeze',
            message: `Canvas unresponsive after interrupted drag: ${err.message}`,
          });
        });
      }

      // ── Step 3: Multi-Input Collision ───────────────────────────────────────
      // Dispatches wheel zoom, drag pan, and keyboard events concurrently
      if (canvasBox) {
        const cx = canvasBox.x + canvasBox.width / 2;
        const cy = canvasBox.y + canvasBox.height / 2;

        const wheelTask = async () => {
          const deltas = [-120, 150, -80, 200, -100, 60, -90];
          for (const d of deltas) {
            await page.mouse.wheel(0, d);
            await page.waitForTimeout(15);
          }
        };

        const panDragTask = async () => {
          await page.mouse.move(cx, cy);
          await page.mouse.down({ button: 'middle' }).catch(() => { });
          for (let step = 0; step < 6; step++) {
            await page.mouse.move(cx + step * 15, cy + step * 15);
            await page.waitForTimeout(15);
          }
          await page.mouse.up({ button: 'middle' }).catch(() => { });
        };

        const keyboardTask = async () => {
          const keys = ['Space', 'Shift', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Escape', 'KeyW', 'KeyA'];
          for (const key of keys) {
            await page.keyboard.press(key);
            await page.waitForTimeout(10);
          }
        };

        // Dispatch all three interaction paradigms concurrently
        await Promise.all([wheelTask(), panDragTask(), keyboardTask()]);

        // Evaluate canvas transform values for NaN or Infinity anomalies
        const transformEvaluation = await page.evaluate(() => {
          const latestVp = (window as any).__latestVttViewport;
          const errors: string[] = [];

          if (latestVp) {
            if (Number.isNaN(latestVp.x) || !Number.isFinite(latestVp.x)) {
              errors.push(`Viewport X evaluates to invalid number: ${latestVp.x}`);
            }
            if (Number.isNaN(latestVp.y) || !Number.isFinite(latestVp.y)) {
              errors.push(`Viewport Y evaluates to invalid number: ${latestVp.y}`);
            }
            if (Number.isNaN(latestVp.zoom) || !Number.isFinite(latestVp.zoom) || latestVp.zoom <= 0) {
              errors.push(`Viewport Zoom evaluates to invalid number: ${latestVp.zoom}`);
            }
          }

          const canvas = document.querySelector('canvas');
          if (canvas) {
            const transform = window.getComputedStyle(canvas).transform;
            if (transform.includes('NaN')) {
              errors.push(`Canvas CSS transform contains NaN: ${transform}`);
            }
          }

          return { errors, latestVp };
        });

        if (transformEvaluation.errors.length > 0) {
          defectLedger.push({
            scenario: 'Multi-Input Collision',
            type: 'Transform NaN/Anomaly',
            message: transformEvaluation.errors.join(' | '),
          });
        }
        expect(transformEvaluation.errors).toEqual([]);
      }
    } finally {
      // ── Teardown Listeners Cleanly ───────────────────────────────────────────
      page.off('console', onConsole);
      page.off('pageerror', onPageError);

      // ── Step 4: Error Capturing & Markdown Defect Ledger Output ──────────────
      const reportPath = path.resolve('logs/chaos_test_report.md');
      const logDir = path.dirname(reportPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      let markdown = `# Chaos & Input Stress Test Report\n\n`;
      markdown += `- **Timestamp:** ${new Date().toISOString()}\n`;
      markdown += `- **Total Defects / Anomalies Logged:** ${defectLedger.length}\n`;
      markdown += `- **Console Errors Captured:** ${consoleErrors.length}\n`;
      markdown += `- **Uncaught Exceptions Captured:** ${pageErrors.length}\n\n`;

      markdown += `### Stress Scenarios Tested:\n`;
      markdown += `1. **Rapid-Fire Button Spamming:** Sequential 12-click bursts within ~120ms checking state integrity and uncaught rejections.\n`;
      markdown += `2. **Interrupted Pointer Interactions:** Token drag with pointerdown + pointermove followed by Escape and blur before pointerup.\n`;
      markdown += `3. **Multi-Input Collision:** Concurrent dispatch of mouse wheel zoom, middle-click pan drag, and keyboard navigation.\n\n`;

      if (defectLedger.length === 0) {
        markdown += `### Status: System fully resilient under chaos inputs with 0 defects logged.\n`;
      } else {
        markdown += `### Captured Defects & Stress Anomalies:\n\n`;
        defectLedger.forEach((entry, idx) => {
          markdown += `#### ${idx + 1}. [${entry.scenario}] ${entry.type}\n`;
          markdown += `\`\`\`text\n${entry.message}\n\`\`\`\n`;
          if (entry.stack) {
            markdown += `**Stack trace:**\n\`\`\`text\n${entry.stack}\n\`\`\`\n`;
          }
          markdown += `\n---\n`;
        });
      }

      fs.writeFileSync(reportPath, markdown, 'utf8');
    }
  });
});
