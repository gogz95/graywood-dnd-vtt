// frontend/src/lib/services/demoEncounterSeeder.ts
// Zero-Prep First-Run Onboarding Encounter Engine ("Ambush at Triboar Trail")
// Hydrates Dexie databases, local storage party rosters, and tactical canvas in < 400ms

import { mapsDb } from '../db/mapsDb';
import { compendiumDb } from '../db/compendiumDb';
import { dexieDb } from '../db/dexieDb';
import { canvasStore, type CanvasToken } from '../../stores/canvasStore.svelte';
import { projectorStore } from '../stores/projectorStore.svelte';
import { campaignStore } from '../stores/campaignStore.svelte';
import type { TacticalBattlemap } from '../types/maps';
import type { VisionSource } from '../canvas/LightShadowRenderer';

export const STARTER_ENCOUNTER_ID = 'map-triboar-trail-starter';

export const STARTER_ENCOUNTER_PAYLOAD = {
  id: STARTER_ENCOUNTER_ID,
  name: 'Ambush at Triboar Trail',
  description: 'A dense pine crossroads along the Triboar Trail. Three goblins lie in wait behind mossy boulders and cedar trees while four adventurers rest around a flickering campfire.',
  battlemap: {
    id: STARTER_ENCOUNTER_ID,
    name: 'Ambush at Triboar Trail',
    type: 'tactical' as const,
    biome: 'forest' as const,
    grid: {
      type: 'square' as const,
      widthCells: 25,
      heightCells: 20,
      sizePx: 100,
      offsetX: 0,
      offsetY: 0,
      opacity: 0.35,
      color: '#10b981',
    },
    dimensions: {
      widthPx: 2500,
      heightPx: 2000,
    },
    lighting: {
      ambientDarkness: 0.70,
      tintColor: '#07111e',
      lights: [
        {
          id: 'light-campfire-center',
          x: 1250,
          y: 1000,
          radius: 800,
          brightRadius: 400,
          dimRadius: 800,
          color: '#ff8833',
          intensity: 0.95,
          flicker: true,
          flickerSpeed: 8.0,
          flickerIntensity: 0.20,
        },
      ],
    },
    fogOfWar: {
      revealedPolygons: [
        [
          { x: 800, y: 700 },
          { x: 1700, y: 700 },
          { x: 1700, y: 1300 },
          { x: 800, y: 1300 },
        ],
      ],
      concealedPolygons: [],
    },
    walls: [
      { id: 'boulder-nw-1', p1: { x: 450, y: 450 }, p2: { x: 650, y: 450 }, type: 'wall' as const },
      { id: 'boulder-nw-2', p1: { x: 650, y: 450 }, p2: { x: 650, y: 650 }, type: 'wall' as const },
      { id: 'boulder-nw-3', p1: { x: 650, y: 650 }, p2: { x: 450, y: 650 }, type: 'wall' as const },
      { id: 'boulder-nw-4', p1: { x: 450, y: 650 }, p2: { x: 450, y: 450 }, type: 'wall' as const },
      { id: 'boulder-ne-1', p1: { x: 1850, y: 450 }, p2: { x: 2050, y: 450 }, type: 'wall' as const },
      { id: 'boulder-ne-2', p1: { x: 2050, y: 450 }, p2: { x: 2050, y: 650 }, type: 'wall' as const },
      { id: 'boulder-ne-3', p1: { x: 2050, y: 650 }, p2: { x: 1850, y: 650 }, type: 'wall' as const },
      { id: 'boulder-ne-4', p1: { x: 1850, y: 650 }, p2: { x: 1850, y: 450 }, type: 'wall' as const },
      { id: 'thicket-sw-1', p1: { x: 300, y: 1350 }, p2: { x: 750, y: 1350 }, type: 'wall' as const },
      { id: 'thicket-sw-2', p1: { x: 750, y: 1350 }, p2: { x: 750, y: 1750 }, type: 'wall' as const },
      { id: 'thicket-se-1', p1: { x: 1750, y: 1350 }, p2: { x: 2200, y: 1350 }, type: 'wall' as const },
      { id: 'thicket-se-2', p1: { x: 2200, y: 1350 }, p2: { x: 2200, y: 1750 }, type: 'wall' as const },
    ],
    tokens: [],
    textureUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='2500' height='2000' viewBox='0 0 2500 2000'><rect width='2500' height='2000' fill='%23142318'/><path d='M 1150 0 L 1350 0 L 1350 2000 L 1150 2000 Z' fill='%233a2e22'/><path d='M 0 900 L 2500 900 L 2500 1100 L 0 1100 Z' fill='%233a2e22'/><circle cx='1250' cy='1000' r='140' fill='%23271e16'/><circle cx='1250' cy='1000' r='50' fill='%23e65100'/><circle cx='1250' cy='1000' r='25' fill='%23ffb74d'/><circle cx='550' cy='550' r='100' fill='%23475569' stroke='%23334155' stroke-width='8'/><circle cx='1950' cy='550' r='100' fill='%23475569' stroke='%23334155' stroke-width='8'/><rect x='300' y='1350' width='450' height='400' rx='40' fill='%230f1e14' stroke='%231b3824' stroke-width='6'/><rect x='1750' y='1350' width='450' height='400' rx='40' fill='%230f1e14' stroke='%231b3824' stroke-width='6'/></svg>",
  },
  combatants: [
    {
      id: 'tok-valeros-fighter',
      name: 'Valeros (Fighter)',
      x: 11,
      y: 10,
      color: '#3b82f6',
      isPlayer: true,
      hp: 12,
      maxHp: 12,
      ac: 18,
      sizeInCells: 1,
      sightRadiusFeet: 30,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: true,
    },
    {
      id: 'tok-merisiel-rogue',
      name: 'Merisiel (Rogue)',
      x: 12,
      y: 11,
      color: '#10b981',
      isPlayer: true,
      hp: 9,
      maxHp: 9,
      ac: 15,
      sizeInCells: 1,
      sightRadiusFeet: 60,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: true,
    },
    {
      id: 'tok-ezren-wizard',
      name: 'Ezren (Wizard)',
      x: 10,
      y: 11,
      color: '#a855f7',
      isPlayer: true,
      hp: 8,
      maxHp: 8,
      ac: 12,
      sizeInCells: 1,
      sightRadiusFeet: 30,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: true,
    },
    {
      id: 'tok-kyra-cleric',
      name: 'Kyra (Cleric)',
      x: 11,
      y: 12,
      color: '#f59e0b',
      isPlayer: true,
      hp: 10,
      maxHp: 10,
      ac: 16,
      sizeInCells: 1,
      sightRadiusFeet: 30,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: true,
    },
    {
      id: 'tok-goblin-ambusher-1',
      name: 'Goblin Archer (North)',
      x: 6,
      y: 6,
      color: '#dc2626',
      isPlayer: false,
      hp: 7,
      maxHp: 7,
      ac: 15,
      sizeInCells: 1,
      sightRadiusFeet: 60,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: false,
    },
    {
      id: 'tok-goblin-ambusher-2',
      name: 'Goblin Archer (East)',
      x: 18,
      y: 6,
      color: '#dc2626',
      isPlayer: false,
      hp: 7,
      maxHp: 7,
      ac: 15,
      sizeInCells: 1,
      sightRadiusFeet: 60,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: false,
    },
    {
      id: 'tok-goblin-ambusher-3',
      name: 'Goblin Skirmisher (South)',
      x: 19,
      y: 14,
      color: '#dc2626',
      isPlayer: false,
      hp: 7,
      maxHp: 7,
      ac: 15,
      sizeInCells: 1,
      sightRadiusFeet: 60,
      elevation: 0,
      conditions: [] as string[],
      isOrbSealed: false,
      isVisible: false,
    },
  ],
  actors: [
    {
      id: 'actor-goblin-srd',
      name: 'Goblin',
      type: 'monster' as const,
      size: 'Small',
      race: 'humanoid (goblinoid)',
      alignment: 'neutral evil',
      ac: 15,
      armorType: 'leather armor, shield',
      hp: 7,
      hitDice: '2d6',
      speed: '30 ft.',
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
      skills: 'Stealth +6',
      senses: 'darkvision 60 ft., passive Perception 9',
      languages: 'Common, Goblin',
      cr: '1/4',
      actions: [
        {
          name: 'Scimitar',
          desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
        },
        {
          name: 'Shortbow',
          desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
        },
      ],
      specialAbilities: [
        {
          name: 'Nimble Escape',
          desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
        },
      ],
    },
  ],
  soundscape: {
    preset: 'Forest Night Ambush',
    stems: [
      { id: 'amb-winds', name: 'Forest Night Winds', volume: 0.65, loop: true },
      { id: 'amb-campfire', name: 'Campfire Crackle', volume: 0.80, loop: true },
    ],
  },
  journal: {
    id: 'note-triboar-ambush',
    title: 'DM Brief: Ambush at Triboar Trail',
    category: 'Encounters',
    content: '### Tactical Briefing: Ambush at Triboar Trail\n\n**Terrain:** Dense pine forest with 10-ft mossy granite boulders on the flanks. Packed muddy road running north-south and east-west.\n\n**Lighting:** Pitch dark night (ambient 70%). The central campfire provides bright light for 20 ft (4 squares) and dim light for an additional 20 ft.\n\n**Goblins Tactics:**\n- 2 Goblin Archers fire Shortbows from behind northern boulders (half cover, +2 AC).\n- 1 Goblin Skirmisher waits in southern brush for party spellcasters to commit, then charges using Nimble Escape.',
  },
};

export interface SeedDemoResult {
  success: boolean;
  mapId: string;
  tokenCount: number;
  durationMs: number;
}

/**
 * Hydrates the full "Ambush at Triboar Trail" starter encounter into Dexie and reactive canvas stores.
 * Completes synchronously in < 400ms without network fetches.
 */
export async function seedDemoEncounter(forceOverwrite = false): Promise<SeedDemoResult> {
  const startTime = performance.now();

  try {
    // 1. Check if map already exists if forceOverwrite is false
    if (!forceOverwrite && mapsDb?.tacticalMaps) {
      try {
        const existing = await mapsDb.tacticalMaps.get(STARTER_ENCOUNTER_ID);
        if (existing) {
          // Activate existing map directly
          activateDemoOnCanvas();
          return {
            success: true,
            mapId: STARTER_ENCOUNTER_ID,
            tokenCount: STARTER_ENCOUNTER_PAYLOAD.combatants.length,
            durationMs: performance.now() - startTime,
          };
        }
      } catch {
        // Continue seeding if lookup errors
      }
    }

    // 2. Ingest Battlemap into Dexie mapsDb
    const battlemapRecord: TacticalBattlemap = {
      id: STARTER_ENCOUNTER_PAYLOAD.battlemap.id,
      name: STARTER_ENCOUNTER_PAYLOAD.battlemap.name,
      type: 'tactical',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      biome: STARTER_ENCOUNTER_PAYLOAD.battlemap.biome,
      grid: STARTER_ENCOUNTER_PAYLOAD.battlemap.grid,
      lighting: {
        ambientDarkness: STARTER_ENCOUNTER_PAYLOAD.battlemap.lighting.ambientDarkness,
        tintColor: STARTER_ENCOUNTER_PAYLOAD.battlemap.lighting.tintColor,
      },
      fogOfWar: STARTER_ENCOUNTER_PAYLOAD.battlemap.fogOfWar,
      walls: STARTER_ENCOUNTER_PAYLOAD.battlemap.walls,
      tokens: STARTER_ENCOUNTER_PAYLOAD.combatants.map((c) => ({
        tokenId: c.id,
        x: c.x * 100,
        y: c.y * 100,
        elevationFt: c.elevation,
        isVisibleToPlayers: c.isVisible,
      })),
      textureUrl: STARTER_ENCOUNTER_PAYLOAD.battlemap.textureUrl,
    };

    if (mapsDb?.tacticalMaps) {
      try {
        await mapsDb.tacticalMaps.put(battlemapRecord);
      } catch (err) {
        console.warn('[DemoSeeder] mapsDb write skipped:', err);
      }
    }

    // 3. Ingest Monster Statblocks & Journal Note into compendiumDb
    if (compendiumDb?.monsters) {
      try {
        for (const actor of STARTER_ENCOUNTER_PAYLOAD.actors) {
          await compendiumDb.monsters.put(actor as any);
        }
        if (compendiumDb.journal) {
          await compendiumDb.journal.put(STARTER_ENCOUNTER_PAYLOAD.journal as any);
        }
      } catch (err) {
        console.warn('[DemoSeeder] compendiumDb write skipped:', err);
      }
    }

    // 4. Ingest Activated Actors into dexieDb
    if (dexieDb?.actors) {
      try {
        for (const actor of STARTER_ENCOUNTER_PAYLOAD.actors) {
          await dexieDb.actors.put({
            id: actor.id,
            name: actor.name,
            type: 'monster',
            is_activated: true,
            statblock: actor,
            updated_at: Date.now(),
          });
        }
      } catch {
        // Ignore in environments without IndexedDB
      }
    }

    // 5. Store 4 Player Characters in localStorage party roster
    if (typeof localStorage !== 'undefined') {
      const partyRoster = STARTER_ENCOUNTER_PAYLOAD.combatants
        .filter((c) => c.isPlayer)
        .map((p) => ({
          id: p.id,
          name: p.name,
          playerName: p.name.split(' ')[0],
          class: p.name.includes('Fighter')
            ? 'Fighter'
            : p.name.includes('Rogue')
              ? 'Rogue'
              : p.name.includes('Wizard')
                ? 'Wizard'
                : 'Cleric',
          level: 1,
          hpCurrent: p.hp,
          hpMax: p.maxHp,
          ac: p.ac,
          passivePerception: 12,
          pin: '1337',
          isOnline: true,
          isNpc: false,
          conditions: [],
          race: 'Human',
          str: 14,
          dex: 14,
          con: 14,
          int: 10,
          wis: 12,
          cha: 10,
          weaponName: 'Primary Weapon',
          armorName: 'Standard Armor',
          hitDiceCurrent: 1,
          hitDiceMax: 1,
        }));
      localStorage.setItem('vtt_party_roster', JSON.stringify(partyRoster));
      localStorage.setItem('vtt_campaign_name', 'Ambush at Triboar Trail');
      localStorage.setItem('wizardCompleted', 'true');
    }

    // 6. Hydrate Tactical Canvas Store
    activateDemoOnCanvas();

    // 7. Update Campaign Store & Projector Store
    if (projectorStore) {
      projectorStore.activeMapId = STARTER_ENCOUNTER_ID;
    }
    if (campaignStore) {
      campaignStore.campaignName = 'Ambush at Triboar Trail';
      campaignStore.hasCompletedWizard = true;
    }

    // 8. Broadcast UI Events
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:roster-updated'));
      window.dispatchEvent(
        new CustomEvent('vtt:switch-tab', { detail: { tab: 'battlemat', view: 'canvas' } })
      );
    }

    const durationMs = performance.now() - startTime;
    return {
      success: true,
      mapId: STARTER_ENCOUNTER_ID,
      tokenCount: STARTER_ENCOUNTER_PAYLOAD.combatants.length,
      durationMs,
    };
  } catch (err) {
    console.error('[DemoSeeder] Failed to seed demo encounter:', err);
    return {
      success: false,
      mapId: STARTER_ENCOUNTER_ID,
      tokenCount: 0,
      durationMs: performance.now() - startTime,
    };
  }
}

/**
 * Directly pushes the battlemap, walls, campfire light, and tokens into canvasStore.
 */
function activateDemoOnCanvas() {
  const p = STARTER_ENCOUNTER_PAYLOAD;
  canvasStore.setGridSize(p.battlemap.grid.sizePx);
  canvasStore.setGridColor(p.battlemap.grid.color);
  canvasStore.setGridOpacity(p.battlemap.grid.opacity);

  canvasStore.setBackgroundTexture(
    p.battlemap.textureUrl,
    p.battlemap.grid.widthCells,
    p.battlemap.grid.heightCells
  );

  // Set wall collision primitives
  canvasStore.setWallsAndDoors?.(
    p.battlemap.walls.map((w) => ({
      id: w.id,
      x1: w.p1.x,
      y1: w.p1.y,
      x2: w.p2.x,
      y2: w.p2.y,
    })),
    []
  );

  // Set scene lights (Campfire center light)
  canvasStore.sceneLights = p.battlemap.lighting.lights as VisionSource[];

  // Set combatants (4 heroes + 3 ambushers)
  const tokens: CanvasToken[] = p.combatants.map((c) => ({
    id: c.id,
    name: c.name,
    x: c.x,
    y: c.y,
    color: c.color,
    isPlayer: c.isPlayer,
    hp: c.hp,
    maxHp: c.maxHp,
    ac: c.ac,
    sizeInCells: c.sizeInCells,
    sightRadiusFeet: c.sightRadiusFeet,
    elevation: c.elevation,
    conditions: c.conditions,
    isOrbSealed: c.isOrbSealed,
    isVisible: c.isVisible,
  }));
  canvasStore.setTokens(tokens);

  // Reveal initial fog around campfire (cells 9-15 x, 8-14 y)
  const campfireCells: string[] = [];
  for (let x = 9; x <= 15; x++) {
    for (let y = 8; y <= 14; y++) {
      campfireCells.push(`${x},${y}`);
    }
  }
  canvasStore.carveFog(campfireCells);

  // Center on lead fighter
  canvasStore.centerOnToken?.('tok-valeros-fighter');
}
