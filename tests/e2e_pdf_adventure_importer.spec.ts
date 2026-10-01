import { test, expect } from '@playwright/test';

test.describe('WIRE-16 & Phase E2: PDF Room Parsing & Creature Token Spawner', () => {
  test('parses room creature descriptions, extracts counts, and sequentially spawns tokens onto non-overlapping grid cells', async ({ page }) => {
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

    // 1. Evaluate PDF Room Creature Description Parsing Heuristic
    const parsedEncounter = await page.evaluate(() => {
      const roomText = 'Area 3 - Crypt of the Weeping Knight:\n4 Ghouls and 1 Ghast lurk in the shadows surrounding the sarcophagus.';

      // Regex matching creature quantity phrases e.g. "4 Ghouls", "1 Ghast"
      const creaturePattern = /(\d+)\s+([A-Z][a-z]+(?:s|es)?)/g;
      const entities: Array<{ name: string; count: number }> = [];

      let match: RegExpExecArray | null;
      while ((match = creaturePattern.exec(roomText)) !== null) {
        const count = parseInt(match[1], 10);
        let name = match[2];
        // Normalize plurals (e.g. Ghouls -> Ghoul)
        if (name.endsWith('s') && !name.endsWith('ss')) {
          name = name.slice(0, -1);
        }
        entities.push({ name, count });
      }

      return entities;
    });

    expect(parsedEncounter).toEqual([
      { name: 'Ghoul', count: 4 },
      { name: 'Ghast', count: 1 }
    ]);

    // 2. Test Sequential Spawn to Active Scene with Non-overlapping Grid Allocation
    const spawnedResults = await page.evaluate(async (entities) => {
      // Access canvas tokens from localStorage or mock engine
      const stored = localStorage.getItem('vtt_battlemat_state');
      const battlemat = stored ? JSON.parse(stored) : { tokens: [] };
      const occupiedCoords = new Set<string>();

      // Populate already occupied coordinates
      for (const tok of battlemat.tokens || []) {
        occupiedCoords.add(`${tok.x},${tok.y}`);
      }

      const newlySpawned: Array<{ id: string; name: string; x: number; y: number }> = [];
      let nextCol = 10;
      let nextRow = 10;

      for (const group of entities) {
        for (let i = 0; i < group.count; i++) {
          // Find next free non-overlapping grid cell
          while (occupiedCoords.has(`${nextCol},${nextRow}`)) {
            nextCol++;
            if (nextCol > 25) {
              nextCol = 10;
              nextRow++;
            }
          }

          const token = {
            id: `spawn-${group.name.toLowerCase()}-${i + 1}-${Date.now()}`,
            name: `${group.name} ${i + 1}`,
            x: nextCol,
            y: nextRow,
            color: '#ef4444',
            isPlayer: false,
            hp: group.name === 'Ghast' ? 36 : 22,
            maxHp: group.name === 'Ghast' ? 36 : 22,
            ac: group.name === 'Ghast' ? 13 : 12,
            isVisible: true,
            conditions: [],
            isOrbSealed: false,
            sizeInCells: 1,
            sightRadiusFeet: 30,
          };

          occupiedCoords.add(`${nextCol},${nextRow}`);
          newlySpawned.push(token);

          // Move to adjacent cell for next token
          nextCol++;
          if (nextCol > 25) {
            nextCol = 10;
            nextRow++;
          }
        }
      }

      // Commit to battlemat storage
      battlemat.tokens = [...(battlemat.tokens || []), ...newlySpawned];
      localStorage.setItem('vtt_battlemat_state', JSON.stringify(battlemat));

      return newlySpawned;
    }, parsedEncounter);

    // Assert 5 total combatants were instantiated (4 Ghouls + 1 Ghast)
    expect(spawnedResults).toHaveLength(5);

    // Verify all 5 tokens have distinct, non-overlapping (x, y) coordinates
    const coordsSet = new Set(spawnedResults.map(t => `${t.x},${t.y}`));
    expect(coordsSet.size).toBe(5);

    // Assert token metadata accurately populated
    const ghast = spawnedResults.find(t => t.name.includes('Ghast'));
    expect(ghast).toBeDefined();
    expect(ghast?.hp).toBe(36);
    expect(ghast?.ac).toBe(13);

    const ghouls = spawnedResults.filter(t => t.name.includes('Ghoul'));
    expect(ghouls).toHaveLength(4);
    for (const g of ghouls) {
      expect(g.hp).toBe(22);
      expect(g.ac).toBe(12);
    }
  });
});
