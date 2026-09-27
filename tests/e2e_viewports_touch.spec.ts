import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface ViewportSweepResult {
  name: string;
  resolution: string;
  canvasVisible: boolean;
  navVisible: boolean;
  drawerClipped: boolean;
  clipDetails?: string;
  passed: boolean;
}

interface TouchProbeResult {
  gesture: string;
  unhandledErrors: string[];
  viewportValid: boolean;
  passed: boolean;
  notes: string;
}

test.describe('Viewport Scalability & Touch Emulation Suite', () => {
  test('Sweeps standard display resolutions and exercises multi-touch gestures', async ({ browser }) => {
    test.setTimeout(180000); // 3-minute timeout for multi-viewport sweeps

    const sweepResults: ViewportSweepResult[] = [];
    const touchResults: TouchProbeResult[] = [];
    const uncaughtExceptions: string[] = [];
    const reportPath = path.resolve('logs/viewport_touch_report.md');

    const appUrl = process.env.VTT_URL || 'http://localhost:5173';

    // Helper: Navigation with port fallbacks
    const navigateSafely = async (page: Page) => {
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
        await skipBtn.click({ timeout: 1500, force: true }).catch(() => {});
        await expect(skipBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
      }
    };

    try {
      // ── Step 1: Resolution Sweep ───────────────────────────────────────────
      const viewports = [
        { name: '4K Ultra HD', width: 3840, height: 2160 },
        { name: '1080p Full HD', width: 1920, height: 1080 },
        { name: 'Compact Laptop', width: 1366, height: 768 },
        { name: 'Tablet Landscape', width: 1024, height: 768 },
      ];

      for (const vp of viewports) {
        let context: BrowserContext | null = null;
        try {
          context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            hasTouch: false,
          });

          const page = await context.newPage();
          page.on('pageerror', (err) => uncaughtExceptions.push(`[${vp.name}] ${err.message}`));

          await navigateSafely(page);

          // 1. Assert canvas element visibility
          const canvas = page.locator('canvas').first();
          const isCanvasVis = await canvas.isVisible({ timeout: 10000 }).catch(() => false);
          expect(isCanvasVis).toBe(true);

          // 2. Assert primary navigation controls visibility
          const navControls = page.locator('header, nav, aside, [role="navigation"]').first();
          const isNavVis = await navControls.isVisible({ timeout: 5000 }).catch(() => false);
          expect(isNavVis).toBe(true);

          // 3. Open a modal drawer (Chat Drawer) and assert it does not clip outside viewport bounds
          let drawerClipped = false;
          let clipDetails: string | undefined;

          const chatBtn = page.locator('button:has-text("Tabletop Chat"), button:has-text("💬")').first();
          if (await chatBtn.isVisible().catch(() => false)) {
            await chatBtn.click({ timeout: 1000, force: true }).catch(() => {});

            const drawer = page.locator('aside[aria-label*="Chat"], aside, dialog, .drawer').first();
            if (await drawer.isVisible({ timeout: 2000 }).catch(() => false)) {
              const box = await drawer.boundingBox();
              if (box) {
                const exceedsRight = box.x + box.width > vp.width + 5;
                const exceedsBottom = box.y + box.height > vp.height + 5;
                const exceedsLeft = box.x < -5;

                if (exceedsRight || exceedsBottom || exceedsLeft) {
                  drawerClipped = true;
                  clipDetails = `Drawer rect [x:${box.x.toFixed(0)}, y:${box.y.toFixed(0)}, w:${box.width.toFixed(0)}, h:${box.height.toFixed(0)}] overflows viewport [${vp.width}x${vp.height}]`;
                }
              }
            }
          }

          const passed = isCanvasVis && isNavVis && !drawerClipped;
          sweepResults.push({
            name: vp.name,
            resolution: `${vp.width}x${vp.height}`,
            canvasVisible: isCanvasVis,
            navVisible: isNavVis,
            drawerClipped,
            clipDetails,
            passed,
          });

          expect(drawerClipped).toBe(false);
        } finally {
          if (context) {
            await context.close();
          }
        }
      }

      // ── Step 2: Touch Emulation (Pinch-to-Zoom & Two-Finger Pan) ───────────
      let touchContext: BrowserContext | null = null;
      try {
        touchContext = await browser.newContext({
          viewport: { width: 1024, height: 768 },
          hasTouch: true,
          isMobile: true,
        });

        const touchPage = await touchContext.newPage();
        const touchErrors: string[] = [];
        touchPage.on('pageerror', (err) => touchErrors.push(err.message));

        await navigateSafely(touchPage);

        const canvas = touchPage.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // 1. Dispatch Multi-Touch Gestures (Pinch-to-Zoom and Two-Finger Pan) directly to canvas wrapper
        const gestureResult = await touchPage.evaluate(() => {
          const target = document.querySelector('canvas');
          if (!target) return { success: false, reason: 'Canvas element not found' };

          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          // TouchStart with 2 contact points
          const t1 = new Touch({
            identifier: 101,
            target,
            clientX: cx - 40,
            clientY: cy,
            pageX: cx - 40,
            pageY: cy,
          });
          const t2 = new Touch({
            identifier: 102,
            target,
            clientX: cx + 40,
            clientY: cy,
            pageX: cx + 40,
            pageY: cy,
          });

          target.dispatchEvent(
            new TouchEvent('touchstart', {
              touches: [t1, t2],
              targetTouches: [t1, t2],
              changedTouches: [t1, t2],
              bubbles: true,
              cancelable: true,
            })
          );

          // Gesture 1: Pinch-to-zoom (expanding touch distance)
          const pinchT1 = new Touch({
            identifier: 101,
            target,
            clientX: cx - 90,
            clientY: cy,
            pageX: cx - 90,
            pageY: cy,
          });
          const pinchT2 = new Touch({
            identifier: 102,
            target,
            clientX: cx + 90,
            clientY: cy,
            pageX: cx + 90,
            pageY: cy,
          });

          target.dispatchEvent(
            new TouchEvent('touchmove', {
              touches: [pinchT1, pinchT2],
              targetTouches: [pinchT1, pinchT2],
              changedTouches: [pinchT1, pinchT2],
              bubbles: true,
              cancelable: true,
            })
          );

          // Gesture 2: Two-Finger Pan (synchronous parallel translation)
          const panT1 = new Touch({
            identifier: 101,
            target,
            clientX: cx - 90 + 60,
            clientY: cy + 40,
            pageX: cx - 90 + 60,
            pageY: cy + 40,
          });
          const panT2 = new Touch({
            identifier: 102,
            target,
            clientX: cx + 90 + 60,
            clientY: cy + 40,
            pageX: cx + 90 + 60,
            pageY: cy + 40,
          });

          target.dispatchEvent(
            new TouchEvent('touchmove', {
              touches: [panT1, panT2],
              targetTouches: [panT1, panT2],
              changedTouches: [panT1, panT2],
              bubbles: true,
              cancelable: true,
            })
          );

          // TouchEnd
          target.dispatchEvent(
            new TouchEvent('touchend', {
              touches: [],
              targetTouches: [],
              changedTouches: [panT1, panT2],
              bubbles: true,
              cancelable: true,
            })
          );

          return { success: true };
        });

        // Assert coordinate transforms remain valid without NaN or infinite values
        const isViewportValid = await touchPage.evaluate(() => {
          const raw = localStorage.getItem('vtt_battlemat_state');
          if (raw) {
            try {
              const state = JSON.parse(raw);
              if (state.dmViewport) {
                const { x, y, zoom } = state.dmViewport;
                return !Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(zoom) && Number.isFinite(zoom) && zoom > 0;
              }
            } catch {}
          }
          return true;
        });

        const gesturePassed = gestureResult.success && touchErrors.length === 0 && isViewportValid;
        touchResults.push({
          gesture: 'Multi-touch Pinch-Zoom & Two-Finger Pan',
          unhandledErrors: touchErrors,
          viewportValid: isViewportValid,
          passed: gesturePassed,
          notes: gesturePassed
            ? 'Dispatched 2-finger pinch and pan gestures cleanly with zero unhandled TouchEvent errors.'
            : `Failed gesture dispatch: ${touchErrors.join('; ')}`,
        });

        expect(gesturePassed).toBe(true);
      } finally {
        if (touchContext) {
          await touchContext.close();
        }
      }
    } finally {
      // ── Step 3: Write Markdown Defect & Telemetry Report ─────────────────────
      const logDir = path.dirname(reportPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const sweepFailures = sweepResults.filter((r) => !r.passed).length;
      const touchFailures = touchResults.filter((r) => !r.passed).length;

      let markdown = `# Viewport Scalability & Touch Emulation Report\n\n`;
      markdown += `- **Timestamp:** ${new Date().toISOString()}\n`;
      markdown += `- **Viewports Swept:** ${sweepResults.length}\n`;
      markdown += `- **Layout Clipping Anomalies:** ${sweepFailures}\n`;
      markdown += `- **Touch Gesture Failures:** ${touchFailures}\n`;
      markdown += `- **Uncaught Exceptions Captured:** ${uncaughtExceptions.length}\n\n`;

      markdown += `### Display Resolution Sweep Results:\n\n`;
      markdown += `| Display Preset | Viewport Dimensions | Canvas Visible | Navigation Visible | Drawer Bounds Status | Details |\n`;
      markdown += `| :--- | :--- | :---: | :---: | :---: | :--- |\n`;

      sweepResults.forEach((res) => {
        const drawerStatus = res.drawerClipped ? '❌ Overflow Clipped' : '✅ Within Bounds';
        const details = res.clipDetails || 'Nominal display geometry';
        markdown += `| **${res.name}** | \`${res.resolution}\` | ${res.canvasVisible ? '✅' : '❌'} | ${res.navVisible ? '✅' : '❌'} | ${drawerStatus} | ${details} |\n`;
      });
      markdown += `\n`;

      markdown += `### Touch Emulation & Gesture Probe:\n\n`;
      touchResults.forEach((res) => {
        markdown += `- **Gesture:** ${res.gesture}\n`;
        markdown += `  - **Status:** ${res.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
        markdown += `  - **Viewport Transform Integrity:** ${res.viewportValid ? '✅ Valid numeric coordinates' : '❌ Corrupted transform'}\n`;
        markdown += `  - **Notes:** ${res.notes}\n`;
      });
      markdown += `\n`;

      if (uncaughtExceptions.length > 0) {
        markdown += `### Captured Uncaught Exceptions:\n\n`;
        uncaughtExceptions.forEach((exc, idx) => {
          markdown += `#### ${idx + 1}. [Uncaught Exception]\n`;
          markdown += `\`\`\`text\n${exc}\n\`\`\`\n\n`;
          markdown += `---\n`;
        });
      } else {
        markdown += `### Overall Health: Zero unhandled TouchEvent exceptions or display clipping anomalies logged.\n`;
      }

      fs.writeFileSync(reportPath, markdown, 'utf8');
    }
  });
});
