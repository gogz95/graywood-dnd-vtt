import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Full automated UI sweep and error logger', async ({ page }) => {
  test.setTimeout(120000);

  const errors: { type: string; text: string; location?: string }[] = [];

  // Listen for console errors and uncaught exceptions
  const onConsole = (msg: any) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'Console Error', text: msg.text(), location: msg.location().url });
    }
  };

  const onPageError = (exception: Error) => {
    errors.push({ type: 'Page Uncaught Exception', text: exception.message });
  };

  // Track network requests during click windows
  let currentRequests: { url: string; method: string; type: string }[] = [];
  const onRequest = (req: any) => {
    const rType = req.resourceType();
    if (rType === 'fetch' || rType === 'xhr') {
      currentRequests.push({ url: req.url(), method: req.method(), type: rType });
    }
  };

  // Track WebSocket frames during click windows
  let currentWsFrames: { dir: 'sent' | 'received'; payload: string; url: string }[] = [];
  const onWebsocket = (ws: any) => {
    ws.on('framesent', (event: any) => {
      const payload = typeof event.payload === 'string' ? event.payload : '<binary>';
      if (!isViteHeartbeat(ws.url(), payload)) {
        currentWsFrames.push({ dir: 'sent', payload, url: ws.url() });
      }
    });
    ws.on('framereceived', (event: any) => {
      const payload = typeof event.payload === 'string' ? event.payload : '<binary>';
      if (!isViteHeartbeat(ws.url(), payload)) {
        currentWsFrames.push({ dir: 'received', payload, url: ws.url() });
      }
    });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  page.on('websocket', onWebsocket);

  function isViteHeartbeat(url: string, payload: string): boolean {
    if (url.includes('vite-hmr') || url.includes('/@vite/')) return true;
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'ping' || parsed.type === 'pong' || parsed.type === 'connected') {
        return true;
      }
    } catch { }
    return false;
  }

  // Inject mutation observer & storage trackers before navigation
  await page.addInitScript(() => {
    const audit = {
      domMutations: 0,
      storageMutations: [] as string[],
    };
    (window as any).__auditSideEffects = audit;

    try {
      const origSetItem = Storage.prototype.setItem;
      const origRemoveItem = Storage.prototype.removeItem;
      const origClear = Storage.prototype.clear;

      Storage.prototype.setItem = function (k: string, v: string) {
        try {
          const name = this === window.localStorage ? 'localStorage' : 'sessionStorage';
          audit.storageMutations.push(`${name}.setItem("${k}")`);
        } catch { }
        return origSetItem.call(this, k, v);
      };

      Storage.prototype.removeItem = function (k: string) {
        try {
          const name = this === window.localStorage ? 'localStorage' : 'sessionStorage';
          audit.storageMutations.push(`${name}.removeItem("${k}")`);
        } catch { }
        return origRemoveItem.call(this, k);
      };

      Storage.prototype.clear = function () {
        try {
          const name = this === window.localStorage ? 'localStorage' : 'sessionStorage';
          audit.storageMutations.push(`${name}.clear()`);
        } catch { }
        return origClear.call(this);
      };
    } catch { }

    const setupObserver = () => {
      try {
        const target = document.documentElement || document.body || document;
        const observer = new MutationObserver((mutations) => {
          audit.domMutations += mutations.length;
        });
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      } catch { }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupObserver);
    } else {
      setupObserver();
    }
  });

  try {
    // 1. Navigate to local app (adjust port if not 5173 or 3000)
    const appUrl = process.env.VTT_URL || 'http://localhost:5173';
    console.log(`Navigating to ${appUrl}...`);
    try {
      await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch {
      try {
        await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch {
        await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 5000 });
      }
    }

    const canvasElement = page.locator('canvas').first();
    await expect(canvasElement).toBeVisible({ timeout: 10000 });

    // Ensure MutationObserver is attached to the live document root
    await page.evaluate(() => {
      if (!(window as any).__auditObserverAttached) {
        (window as any).__auditObserverAttached = true;
        const observer = new MutationObserver((mutations) => {
          if ((window as any).__auditSideEffects) {
            (window as any).__auditSideEffects.domMutations += mutations.length;
          }
        });
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      }
    }).catch(() => { });

    // Dismiss onboarding/setup wizard if present so main UI buttons are interactive
    const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible().catch(() => false)) {
      console.log('Dismissing first-run wizard modal to expose interactive UI elements...');
      await skipBtn.click({ timeout: 1500, force: true }).catch(() => { });
      await expect(skipBtn).toBeHidden({ timeout: 5000 });
    }

    // 2. Discover and click every visible button
    const buttons = page.locator('button, [role="button"]');
    const count = await buttons.count();
    console.log(`Discovered ${count} interactive buttons.`);

    interface ButtonAudit {
      index: number;
      text: string;
      status: string;
      domMutations: number;
      requests: string[];
      wsFrames: string[];
      storageMutations: string[];
      routeShift?: string;
    }

    const buttonResults: ButtonAudit[] = [];

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      try {
        const isVis = await btn.isVisible().catch(() => false);
        if (!isVis) {
          continue;
        }
        const isEn = await btn.isEnabled({ timeout: 500 }).catch(() => false);
        if (!isEn) {
          continue;
        }

        const text = ((await btn.innerText({ timeout: 500 }).catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || `Index #${i}`).trim().replace(/\s+/g, ' ');
        console.log(`[#${i}] Clicking button: ${text}`);

        // Reset activity windows
        currentRequests = [];
        currentWsFrames = [];
        const urlBefore = page.url();

        await page.evaluate(() => {
          if ((window as any).__auditSideEffects) {
            (window as any).__auditSideEffects.domMutations = 0;
            (window as any).__auditSideEffects.storageMutations = [];
          }
        }).catch(() => { });

        // Perform click
        await btn.click({ timeout: 1500, force: true }).catch((err: Error) => {
          errors.push({ type: 'Button Click Exception', text: `Button #${i} ("${text}"): ${err.message}` });
        });
        await page.waitForTimeout(150);

        // Dismiss open modals/menus by pressing Escape
        await page.keyboard.press('Escape');

        // Harvest side effects
        const urlAfter = page.url();
        const routeChanged = urlBefore !== urlAfter;

        const inPageEffects = await page.evaluate(() => {
          const audit = (window as any).__auditSideEffects;
          if (!audit) return { domMutations: 0, storageMutations: [] };
          const res = {
            domMutations: audit.domMutations,
            storageMutations: [...audit.storageMutations],
          };
          audit.domMutations = 0;
          audit.storageMutations = [];
          return res;
        }).catch(() => ({ domMutations: 0, storageMutations: [] }));

        const requestsDispatched = currentRequests.map((r) => `${r.method} ${r.url}`);
        const wsDispatched = currentWsFrames.map((f) => `[${f.dir.toUpperCase()}] ${f.payload.slice(0, 120)}`);

        let status = '[Dead / No-Op]';
        if (inPageEffects.domMutations > 0) {
          status = '[Active via DOM]';
        } else if (requestsDispatched.length > 0 || wsDispatched.length > 0) {
          status = '[Active via Network/WS]';
        } else if (inPageEffects.storageMutations.length > 0) {
          status = '[Active via Storage]';
        } else if (routeChanged) {
          status = '[Active via Route]';
        }

        buttonResults.push({
          index: i,
          text,
          status,
          domMutations: inPageEffects.domMutations,
          requests: requestsDispatched,
          wsFrames: wsDispatched,
          storageMutations: inPageEffects.storageMutations,
          routeShift: routeChanged ? `${urlBefore} -> ${urlAfter}` : undefined,
        });
      } catch (e: any) {
        errors.push({ type: 'Button Click Failure', text: `Button index ${i}: ${e.message}` });
      }
    }

    // 3. Canvas interaction sweep
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible().catch(() => false)) {
      console.log('Exercising main canvas element...');
      const box = await canvas.boundingBox();
      if (box) {
        // Zoom simulation
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(100);
        await page.mouse.wheel(0, -120);

        // Drag simulation
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100);
        await page.mouse.up();
      }
    }

    // 4. Write output to markdown defect ledger
    const domActive = buttonResults.filter((b) => b.status === '[Active via DOM]').length;
    const netWsActive = buttonResults.filter((b) => b.status === '[Active via Network/WS]').length;
    const storageActive = buttonResults.filter((b) => b.status === '[Active via Storage]').length;
    const routeActive = buttonResults.filter((b) => b.status === '[Active via Route]').length;
    const deadButtons = buttonResults.filter((b) => b.status === '[Dead / No-Op]');
    const networkWsButtons = buttonResults.filter((b) => b.requests.length > 0 || b.wsFrames.length > 0);

    const reportPath = path.resolve('logs/full_system_test_report.md');
    const logDir = path.dirname(reportPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    let markdown = `# Automated System Test Report\n\n`;
    markdown += `- **Timestamp:** ${new Date().toISOString()}\n`;
    markdown += `- **Buttons Discovered:** ${count}\n`;
    markdown += `- **Buttons Evaluated:** ${buttonResults.length}\n`;
    markdown += `- **Errors Captured:** ${errors.length}\n\n`;

    markdown += `### Button Activity Breakdown:\n`;
    markdown += `- **[Active via DOM]:** ${domActive}\n`;
    markdown += `- **[Active via Network/WS]:** ${netWsActive}\n`;
    markdown += `- **[Active via Storage]:** ${storageActive}\n`;
    markdown += `- **[Active via Route]:** ${routeActive}\n`;
    markdown += `- **[Dead / No-Op]:** ${deadButtons.length}\n\n`;

    markdown += `### Dispatched Network & WebSocket Endpoints:\n\n`;
    if (networkWsButtons.length === 0) {
      markdown += `*No buttons dispatched external Network or WebSocket traffic during test window.*\n\n`;
    } else {
      networkWsButtons.forEach((btn) => {
        markdown += `#### Button #${btn.index}: "${btn.text}" — ${btn.status}\n`;
        if (btn.requests.length > 0) {
          markdown += `- **HTTP/Fetch Requests (${btn.requests.length}):**\n`;
          const reqCounts = new Map<string, number>();
          btn.requests.forEach((r) => reqCounts.set(r, (reqCounts.get(r) || 0) + 1));
          reqCounts.forEach((cnt, req) => {
            markdown += `  - \`${req}\`${cnt > 1 ? ` (x${cnt})` : ''}\n`;
          });
        }
        if (btn.wsFrames.length > 0) {
          markdown += `- **WebSocket Frames (${btn.wsFrames.length}):**\n`;
          const frameCounts = new Map<string, number>();
          btn.wsFrames.forEach((f) => frameCounts.set(f, (frameCounts.get(f) || 0) + 1));
          frameCounts.forEach((cnt, frame) => {
            markdown += `  - \`${frame}\`${cnt > 1 ? ` (x${cnt})` : ''}\n`;
          });
        }
        if (btn.storageMutations.length > 0) {
          markdown += `- **Storage Mutations (${btn.storageMutations.length}):**\n`;
          const stCounts = new Map<string, number>();
          btn.storageMutations.forEach((s) => stCounts.set(s, (stCounts.get(s) || 0) + 1));
          stCounts.forEach((cnt, item) => {
            markdown += `  - \`${item}\`${cnt > 1 ? ` (x${cnt})` : ''}\n`;
          });
        }
        if (btn.routeShift) {
          markdown += `- **Route Change:** \`${btn.routeShift}\`\n`;
        }
        markdown += `\n`;
      });
    }

    if (deadButtons.length > 0) {
      markdown += `### Dead / No-Op Buttons:\n\n`;
      deadButtons.forEach((btn) => {
        markdown += `- Button #${btn.index}: "${btn.text}"\n`;
      });
      markdown += `\n`;
    }

    if (errors.length === 0) {
      markdown += `### Status: All checks passed with 0 runtime errors logged.\n`;
    } else {
      markdown += `### Captured Faults & Errors:\n\n`;
      errors.forEach((err, idx) => {
        markdown += `#### ${idx + 1}. [${err.type}]\n`;
        markdown += `\`\`\`text\n${err.text}\n\`\`\`\n`;
        if (err.location) markdown += `- **Location:** ${err.location}\n`;
        markdown += `\n---\n`;
      });
    }

    fs.writeFileSync(reportPath, markdown, 'utf8');
    console.log(`Test run complete. Report saved to: ${reportPath}`);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('request', onRequest);
    page.off('websocket', onWebsocket);
  }
});
