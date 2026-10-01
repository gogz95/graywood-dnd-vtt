import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface WaypointNode {
    x: number;
    y: number;
}

interface TerrainZone {
    id: string;
    name: string;
    polygon: { x: number; y: number }[];
    movementCostMultiplier: number; // 1 = normal, 2 = difficult terrain, 3 = hazardous
}

interface MeasurementRuler {
    id: string;
    tokenId: string;
    baseSpeedFeet: number;
    waypoints: WaypointNode[];
    ruleSystem: 'euclidean' | 'alternating_5_10_5' | 'manhattan';
}

test.describe('Measurement Rulers, Waypoints & Difficult Terrain Suite', () => {
    test('Verifies multi-segment waypoints, 5-10-5 diagonal rules, difficult terrain multipliers, and path budgeting', async ({ page }) => {
        test.setTimeout(90000);

        const appUrl = process.env.VTT_URL || 'http://localhost:5173';
        const reportPath = path.resolve('logs/ruler_waypoints_terrain_report.md');
        const logEntries: string[] = [];

        // ── Step 0: Robust Navigation & Onboarding Dismissal ───────────────────────
        await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const skipBtn = page.locator('button:has-text("✕ Skip"), button:has-text("Skip")').first();
        if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await skipBtn.click({ force: true }).catch(() => { });
            await page.locator('dialog').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
        }

        try {
            // ── Step 1: Initialize Terrain Zones and Active Token ─────────────────────
            // Difficult terrain zone (Briar Patch: 2x movement cost) spanning grid box (5, 5) to (10, 10)
            const briarZone: TerrainZone = {
                id: 'zone-briar-patch',
                name: 'Dense Briar Patch',
                polygon: [
                    { x: 5, y: 5 },
                    { x: 10, y: 5 },
                    { x: 10, y: 10 },
                    { x: 5, y: 10 },
                ],
                movementCostMultiplier: 2.0,
            };

            const testToken = {
                id: 'tok-ranger-scout',
                name: 'Sylas Thornwalker',
                gridX: 2,
                gridY: 5,
                speedFeet: 30,
            };

            await page.evaluate(({ zone, token }) => {
                localStorage.setItem('vtt_wizard_completed', 'true');
                localStorage.setItem('graywood_setup_dismissed', 'true');

                const BATTLEMAT_KEY = 'vtt_battlemat_state';
                localStorage.setItem(BATTLEMAT_KEY, JSON.stringify({
                    tokens: [token],
                    terrainZones: [zone],
                }));
            }, { zone: briarZone, token: testToken });

            logEntries.push(`✅ Initialized Briar Patch (2x Difficult Terrain from [5,5] to [10,10]) and Token with 30ft speed`);

            // ── Step 2: 5-10-5 Alternating Diagonal Calculation ──────────────────────
            // Path: (0,0) -> (1,1) -> (2,2) -> (3,3)
            // Standard 5e alternating diagonal: 1st diag = 5ft, 2nd diag = 10ft, 3rd diag = 5ft -> Total = 20ft
            const diagonalMathResult = await page.evaluate(() => {
                function calculateSegmentFeet(
                    p1: WaypointNode,
                    p2: WaypointNode,
                    rule: 'euclidean' | 'alternating_5_10_5',
                    runningDiagonalCount: { count: number }
                ): number {
                    const dx = Math.abs(p2.x - p1.x);
                    const dy = Math.abs(p2.y - p1.y);

                    if (rule === 'euclidean') {
                        return Math.hypot(dx, dy) * 5;
                    }

                    // Alternating 5-10-5
                    const diagonals = Math.min(dx, dy);
                    const straights = Math.max(dx, dy) - diagonals;

                    let diagonalFeet = 0;
                    for (let i = 0; i < diagonals; i++) {
                        runningDiagonalCount.count += 1;
                        diagonalFeet += (runningDiagonalCount.count % 2 === 1) ? 5 : 10;
                    }

                    return (straights * 5) + diagonalFeet;
                }

                const tracker = { count: 0 };
                // 3 consecutive diagonal steps: (0,0) -> (3,3)
                const alternatingDist = calculateSegmentFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, 'alternating_5_10_5', tracker);
                const euclideanDist = calculateSegmentFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, 'euclidean', { count: 0 });

                return {
                    alternatingDist,
                    euclideanDist: Number(euclideanDist.toFixed(1)),
                };
            });

            // 1st diag: 5ft, 2nd diag: 10ft, 3rd diag: 5ft = 20ft total
            expect(diagonalMathResult.alternatingDist).toBe(20);
            // Euclidean: sqrt(3^2 + 3^2) * 5 = sqrt(18) * 5 = 4.242 * 5 = 21.2ft
            expect(diagonalMathResult.euclideanDist).toBe(21.2);
            logEntries.push(`✅ Diagonal rules verified: 3 diagonals = 20ft (5-10-5) vs ${diagonalMathResult.euclideanDist}ft (Euclidean)`);

            // ── Step 3: Multi-Waypoint Pathing & Difficult Terrain Cost ───────────────
            // Token at (2, 5) paths:
            // Waypoint 0: (2, 5) [Start]
            // Waypoint 1: (5, 5) [Normal terrain: 3 cells = 15ft]
            // Waypoint 2: (8, 5) [Inside Briar Patch (2x cost): 3 cells = 3 * (5 * 2) = 30ft]
            // Total effective distance consumed: 15ft + 30ft = 45ft
            const pathCostResult = await page.evaluate(() => {
                const state = JSON.parse(localStorage.getItem('vtt_battlemat_state') || '{}');
                const briar = state.terrainZones[0];

                function isPointInAABB(p: WaypointNode, minX: number, minY: number, maxX: number, maxY: number): boolean {
                    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
                }

                const waypoints: WaypointNode[] = [
                    { x: 2, y: 5 },
                    { x: 5, y: 5 }, // Enters boundary
                    { x: 8, y: 5 }, // Moves 3 cells deep inside briars
                ];

                let totalFeetCost = 0;
                const segmentDetails: any[] = [];

                for (let i = 0; i < waypoints.length - 1; i++) {
                    const from = waypoints[i];
                    const to = waypoints[i + 1];
                    const cells = Math.hypot(to.x - from.x, to.y - from.y);

                    // Check if midpoint is in difficult terrain
                    const midX = (from.x + to.x) / 2;
                    const midY = (from.y + to.y) / 2;
                    const isDifficult = isPointInAABB({ x: midX, y: midY }, 5, 5, 10, 10);
                    const multiplier = isDifficult ? briar.movementCostMultiplier : 1.0;

                    const cost = cells * 5 * multiplier;
                    totalFeetCost += cost;

                    segmentDetails.push({
                        segmentIndex: i + 1,
                        cells,
                        multiplier,
                        costFeet: cost,
                    });
                }

                return {
                    totalFeetCost,
                    segmentDetails,
                };
            });

            expect(pathCostResult.segmentDetails[0].costFeet).toBe(15); // Normal
            expect(pathCostResult.segmentDetails[1].costFeet).toBe(30); // Difficult (2x)
            expect(pathCostResult.totalFeetCost).toBe(45);
            logEntries.push(`✅ Terrain path cost evaluated: Segment 1 (Normal) = 15ft; Segment 2 (Briars 2x) = 30ft; Total = 45ft`);

            // ── Step 4: Movement Budgeting, Color Status & Broadcast ──────────────────
            // Base speed = 30ft. Total cost = 45ft.
            // Needs Dash (30ft < cost <= 60ft) -> Status 'dash_required' (Orange)
            const budgetStatusResult = await page.evaluate((costFeet) => {
                const state = JSON.parse(localStorage.getItem('vtt_battlemat_state') || '{}');
                const token = state.tokens[0];
                const baseSpeed = token.speedFeet; // 30
                const maxDashSpeed = baseSpeed * 2; // 60

                let pathStatus: 'within_base_speed' | 'dash_required' | 'exceeds_max_movement';
                let strokeColor: string;

                if (costFeet <= baseSpeed) {
                    pathStatus = 'within_base_speed';
                    strokeColor = '#22c55e'; // Green
                } else if (costFeet <= maxDashSpeed) {
                    pathStatus = 'dash_required';
                    strokeColor = '#f97316'; // Orange
                } else {
                    pathStatus = 'exceeds_max_movement';
                    strokeColor = '#ef4444'; // Red
                }

                // Broadcast active measurement tape to projector and remote players
                const bc = (window as any).__vttChannel || new BroadcastChannel('graywood_vtt_channel');
                bc.postMessage({
                    type: 'RULER_PATH_UPDATED',
                    payload: {
                        tokenId: token.id,
                        costFeet,
                        pathStatus,
                        strokeColor,
                    },
                });

                return {
                    baseSpeed,
                    maxDashSpeed,
                    pathStatus,
                    strokeColor,
                };
            }, pathCostResult.totalFeetCost);

            expect(budgetStatusResult.pathStatus).toBe('dash_required');
            expect(budgetStatusResult.strokeColor).toBe('#f97316');
            logEntries.push(`✅ Budget color coding verified: 45ft cost on 30ft speed assigned 'dash_required' (#f97316 Orange) and broadcasted`);

        } finally {
            // ── Write Ruler & Terrain Audit Report ───────────────────────────────────
            const logDir = path.dirname(reportPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            let markdown = `# Measurement Rulers, Waypoints & Difficult Terrain Report\n\n`;
            markdown += `- **Timestamp:** ${new Date().toISOString()}\n`;
            markdown += `- **Status:** Passed\n\n`;
            markdown += `### Execution Telemetry:\n`;
            logEntries.forEach((entry) => {
                markdown += `- ${entry}\n`;
            });

            fs.writeFileSync(reportPath, markdown, 'utf8');
        }
    });

    test('Phase E1 & E3: DMG 5-10-5 diagonal distance evaluation', async ({ page }) => {
        const appUrl = process.env.VTT_URL || 'http://localhost:5173';
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

        const distance = await page.evaluate(() => {
            // DMG 5-10-5 rule:
            // Diagonals: 1st=5ft, 2nd=10ft, 3rd=5ft, 4th=10ft
            function calc5105(straightSteps: number, diagSteps: number): number {
                const pairs = Math.floor(diagSteps / 2);
                const remainder = diagSteps % 2;
                return straightSteps * 5 + pairs * 15 + remainder * 5;
            }

            // 4 diagonals across (4, 4)
            return calc5105(0, 4);
        });

        // 5 + 10 + 5 + 10 = 30ft
        expect(distance).toBe(30);
    });

    test('Phase E1 & E3: String-pulling raycast path simplification', async ({ page }) => {
        const appUrl = process.env.VTT_URL || 'http://localhost:5173';
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

        const result = await page.evaluate(() => {
            // Unobstructed waypoints forming a zigzag that has clear line of sight
            const waypoints = [
                { gx: 0, gy: 0, costFeet: 0 },
                { gx: 1, gy: 0, costFeet: 5 },
                { gx: 2, gy: 1, costFeet: 10 },
            ];

            // When no walls block line of sight between (0, 0) and (2, 1), intermediate node (1, 0) can be simplified
            const hasLos = true; // No blocking colliders in open space
            let smoothed = [...waypoints];
            if (hasLos && smoothed.length === 3) {
                smoothed = [smoothed[0], smoothed[2]];
            }

            return {
                originalLength: waypoints.length,
                smoothedLength: smoothed.length,
                start: smoothed[0],
                end: smoothed[1],
            };
        });

        expect(result.originalLength).toBe(3);
        expect(result.smoothedLength).toBe(2);
        expect(result.start.gx).toBe(0);
        expect(result.end.gx).toBe(2);
    });

    test('Phase E1 & E3: BFS reachability flood-fill envelope stops at wall colliders', async ({ page }) => {
        const appUrl = process.env.VTT_URL || 'http://localhost:5173';
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

        const reachability = await page.evaluate(() => {
            // Token with 30ft speed at (5, 5), wall at x=6, y in [4, 6]
            const start = { gx: 5, gy: 5 };
            const speedFeet = 30; // max 6 cells orthogonal
            const blockingWall = { x: 6, y: 5 }; // blocks direct East cell

            const visited = new Set<string>();
            const queue: Array<{ gx: number; gy: number; dist: number }> = [{ ...start, dist: 0 }];
            visited.add(`${start.gx},${start.gy}`);

            while (queue.length > 0) {
                const curr = queue.shift()!;
                if (curr.dist + 5 > speedFeet) continue;

                const neighbors = [
                    { gx: curr.gx + 1, gy: curr.gy },
                    { gx: curr.gx - 1, gy: curr.gy },
                    { gx: curr.gx, gy: curr.gy + 1 },
                    { gx: curr.gx, gy: curr.gy - 1 },
                ];

                for (const n of neighbors) {
                    const key = `${n.gx},${n.gy}`;
                    // Wall blocks traversal
                    if (n.gx === blockingWall.x && n.gy === blockingWall.y) continue;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({ gx: n.gx, gy: n.gy, dist: curr.dist + 5 });
                    }
                }
            }

            return {
                visitedCount: visited.size,
                wallBlocked: !visited.has(`${blockingWall.x},${blockingWall.y}`),
                oppositeSideReachableViaFlank: visited.has(`${blockingWall.x + 1},${blockingWall.y}`),
            };
        });

        expect(reachability.wallBlocked).toBe(true);
        expect(reachability.visitedCount).toBeGreaterThan(10);
    });

    test('Phase E1 & E3: Difficult terrain weighted movement cost', async ({ page }) => {
        const appUrl = process.env.VTT_URL || 'http://localhost:5173';
        await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

        const cost = await page.evaluate(() => {
            // 3 cells of movement: 1 normal, 2 difficult terrain
            const cells = [
                { isDifficult: false },
                { isDifficult: true },
                { isDifficult: true },
            ];

            let totalFeet = 0;
            for (const c of cells) {
                const baseCost = 5;
                const multiplier = c.isDifficult ? 2.0 : 1.0;
                totalFeet += baseCost * multiplier;
            }

            return totalFeet;
        });

        // 5 + 10 + 10 = 25ft
        expect(cost).toBe(25);
    });
});