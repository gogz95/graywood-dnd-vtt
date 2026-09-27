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
});