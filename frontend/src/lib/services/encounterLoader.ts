// frontend/src/lib/services/encounterLoader.ts
// Encounter Orchestrator: commits scene, seeds Dexie actors, mounts tactical colliders,
// preserves active party PC positions in marching order, and ignites combat initiative.

import { dexieDb, type ActivatedActor } from '../db/dexieDb';
import { canvasStore, type CanvasToken } from '../../stores/canvasStore.svelte';
import { tokenStore, type TokenInstance } from '../stores/tokenStore.svelte';
import { combatStore, type Combatant } from '../stores/combatStore.svelte';
import { raycastEngine } from '../canvas/lighting/RaycastEngine';
import { audioEngine } from '../audio/AudioEngine';
import { TRIBOAR_AMBUSH_ENCOUNTER, type EncounterBlueprint } from '../data/encounters/triboarAmbush';

export interface LoadEncounterOptions {
  retainPartyPositions?: boolean;
}

export interface LoadEncounterResult {
  success: boolean;
  encounterId: string;
  combatantCount: number;
  wallCount: number;
}

/**
 * Loads and orchestrates a pre-configured encounter into the VTT runtime.
 */
export async function loadEncounter(
  encounterId: string,
  options: LoadEncounterOptions = {}
): Promise<LoadEncounterResult> {
  const encounter: EncounterBlueprint =
    encounterId === 'triboar_ambush' || encounterId.includes('triboar')
      ? TRIBOAR_AMBUSH_ENCOUNTER
      : TRIBOAR_AMBUSH_ENCOUNTER;

  try {
    // 1. Commit monster & terrain statblocks to Dexie activated actors
    for (const actor of encounter.actors) {
      const existing = await dexieDb.actors.get(actor.id);
      if (!existing) {
        await dexieDb.actors.put(actor);
      }
    }

    // 2. Clear previous combat session
    combatStore.endCombat();

    // 3. Grid & Tactical Canvas Setup
    canvasStore.setGridSize(encounter.grid.cellWidthPx);
    canvasStore.setGridColor('#10b981');
    canvasStore.setGridOpacity(0.35);

    // Dynamic 30x20 Dirt Trail with High Embankments Procedural Map Canvas
    const mapWidthPx = encounter.grid.cols * encounter.grid.cellWidthPx; // 2100px
    const mapHeightPx = encounter.grid.rows * encounter.grid.cellWidthPx; // 1400px

    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = mapWidthPx;
    mapCanvas.height = mapHeightPx;
    const ctx = mapCanvas.getContext('2d');

    if (ctx) {
      // Grass / Forest floor base
      ctx.fillStyle = '#1e291e';
      ctx.fillRect(0, 0, mapWidthPx, mapHeightPx);

      // Dirt Road: winding trail through center (y: 560 to 840)
      ctx.fillStyle = '#57412e';
      ctx.beginPath();
      ctx.moveTo(0, 700);
      ctx.bezierCurveTo(700, 680, 1400, 750, mapWidthPx, 710);
      ctx.lineWidth = 210;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#57412e';
      ctx.stroke();

      // Road wheel ruts
      ctx.strokeStyle = '#38281b';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, 660);
      ctx.bezierCurveTo(700, 640, 1400, 710, mapWidthPx, 670);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 740);
      ctx.bezierCurveTo(700, 720, 1400, 790, mapWidthPx, 750);
      ctx.stroke();

      // North Embankment (Elevation 10ft) & Briar Ridge
      ctx.fillStyle = '#142015';
      ctx.fillRect(0, 0, mapWidthPx, 350);

      // South Embankment & Thicket
      ctx.fillStyle = '#142015';
      ctx.fillRect(0, 1050, mapWidthPx, 350);

      // Campfire / Blood stains near dead horses
      ctx.fillStyle = 'rgba(127, 29, 29, 0.45)';
      ctx.beginPath();
      ctx.arc(1050, 700, 90, 0, Math.PI * 2);
      ctx.fill();
    }

    const generatedMapUrl = mapCanvas.toDataURL('image/jpeg', 0.85);
    canvasStore.setBackgroundTexture(
      generatedMapUrl,
      encounter.grid.cols,
      encounter.grid.rows
    );

    // 4. Register collision line segments directly into RaycastEngine.ts
    raycastEngine.clearWalls();
    raycastEngine.addWalls(encounter.walls);

    // Also sync to canvasStore walls representation
    canvasStore.setWallsAndDoors(
      encounter.walls.map((w) => ({
        id: w.id,
        x1: w.p1.x,
        y1: w.p1.y,
        x2: w.p2.x,
        y2: w.p2.y,
      })),
      []
    );

    // 5. Read active party PCs from Dexie / LocalStorage
    let partyActors: ActivatedActor[] = await dexieDb.actors
      .where('type')
      .equals('character')
      .toArray();

    if (partyActors.length === 0) {
      partyActors = await dexieDb.actors
        .filter((a) => a.type === 'pc' || a.type === 'player' || a.type === 'character')
        .toArray();
    }

    // Fallback: Read local storage party roster if Dexie actors are empty
    let partyTokensFromRoster: Array<{ id: string; name: string; hp: number; maxHp: number; ac: number }> = [];
    if (partyActors.length === 0 && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('vtt_party_roster');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            partyTokensFromRoster = parsed.map((p) => ({
              id: p.id || `pc-${p.name.toLowerCase()}`,
              name: p.name,
              hp: p.hpCurrent ?? 12,
              maxHp: p.hpMax ?? 12,
              ac: p.ac ?? 14,
            }));
          }
        }
      } catch {}
    }

    if (partyActors.length === 0 && partyTokensFromRoster.length === 0) {
      // Default 5e SRD level 1 party
      partyTokensFromRoster = [
        { id: 'pc-valeros-fighter', name: 'Valeros (Fighter)', hp: 12, maxHp: 12, ac: 16 },
        { id: 'pc-merisiel-rogue', name: 'Merisiel (Rogue)', hp: 9, maxHp: 9, ac: 14 },
        { id: 'pc-kyra-cleric', name: 'Kyra (Cleric)', hp: 10, maxHp: 10, ac: 16 },
        { id: 'pc-ezren-wizard', name: 'Ezren (Wizard)', hp: 8, maxHp: 8, ac: 12 },
      ];
    }

    // 6. Build Token List (Preserving or Arranging Party Tokens in 2x2 Marching Order)
    const newTokens: CanvasToken[] = [];
    const newInstances: TokenInstance[] = [];
    const combatRoster: Combatant[] = [];

    // Instantiate Encounter Combatants (Goblins + Dead Horses)
    for (const c of encounter.combatants) {
      const canvasToken: CanvasToken = {
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
        sightRadiusFeet: 60,
        elevation: c.elevation ?? 0,
        conditions: [...c.conditions],
        isOrbSealed: false,
        isVisible: c.isVisible, // Hidden goblins: isVisible is false!
      };
      newTokens.push(canvasToken);

      const tokenInst: TokenInstance = {
        instance_id: c.id,
        id: c.id,
        name: c.name,
        x: c.x * encounter.grid.cellWidthPx,
        y: c.y * encounter.grid.cellWidthPx,
        elevation: c.elevation ?? 0,
        size_cells: c.sizeInCells,
        hp: c.hp,
        maxHp: c.maxHp,
        ac: c.ac,
        speed: c.speed,
        color: c.color,
        isPlayer: c.isPlayer,
        isGmOnly: !c.isVisible,
        conditions: [...c.conditions],
      };
      newInstances.push(tokenInst);

      // Roll initiative for hostile monsters only (exclude terrain like dead horses)
      if (c.actorId === 'actor-goblin-srd') {
        const dexMod = 2; // Goblin DEX 14 (+2)
        const d20 = Math.floor(Math.random() * 20) + 1;
        combatRoster.push({
          tokenId: c.id,
          name: c.name,
          initiative: d20 + dexMod,
          dexModifier: dexMod,
          hp: c.hp,
          maxHp: c.maxHp,
          conditions: [...c.conditions],
          isDefeated: false,
        });
      }
    }

    // Position Party in 2x2 Marching Order on Western road (columns 2 & 4, rows 9 & 11)
    const marchingPositions = [
      { x: 3, y: 9 },  // Front Left
      { x: 3, y: 11 }, // Front Right
      { x: 1, y: 9 },  // Rear Left
      { x: 1, y: 11 }, // Rear Right
    ];

    const partySource = partyActors.length > 0 ? partyActors : partyTokensFromRoster;
    partySource.forEach((hero, index) => {
      const pos =
        options.retainPartyPositions && index < canvasStore.tokens.length
          ? { x: canvasStore.tokens[index].x, y: canvasStore.tokens[index].y }
          : marchingPositions[index % marchingPositions.length];

      const heroHp = (hero as any).current_hp ?? (hero as any).hp ?? 10;
      const heroMaxHp = (hero as any).max_hp ?? (hero as any).maxHp ?? 10;
      const heroAc = (hero as any).mechanics?.ac ?? (hero as any).ac ?? 14;
      const heroDex = (hero as any).mechanics?.stats?.dex ?? 12;
      const dexMod = Math.floor((heroDex - 10) / 2);

      const heroToken: CanvasToken = {
        id: hero.id,
        name: hero.name,
        x: pos.x,
        y: pos.y,
        color: '#2563eb',
        isPlayer: true,
        hp: heroHp,
        maxHp: heroMaxHp,
        ac: heroAc,
        sizeInCells: 1,
        sightRadiusFeet: 30,
        elevation: 0,
        conditions: [],
        isOrbSealed: false,
        isVisible: true,
      };
      newTokens.push(heroToken);

      newInstances.push({
        instance_id: hero.id,
        id: hero.id,
        name: hero.name,
        x: pos.x * encounter.grid.cellWidthPx,
        y: pos.y * encounter.grid.cellWidthPx,
        elevation: 0,
        size_cells: 1,
        hp: heroHp,
        maxHp: heroMaxHp,
        ac: heroAc,
        isPlayer: true,
        isGmOnly: false,
      });

      // Roll PC initiative
      const d20 = Math.floor(Math.random() * 20) + 1;
      combatRoster.push({
        tokenId: hero.id,
        name: hero.name,
        initiative: d20 + dexMod,
        dexModifier: dexMod,
        hp: heroHp,
        maxHp: heroMaxHp,
        conditions: [],
        isDefeated: false,
      });
    });

    // Hydrate tokenStore & canvasStore
    tokenStore.tokens = newInstances;
    canvasStore.setTokens(newTokens);

    // 7. Fog of War: Clear fog around western road party approach
    const exploredCells: string[] = [];
    for (let x = 0; x <= 16; x++) {
      for (let y = 6; y <= 14; y++) {
        exploredCells.push(`${x},${y}`);
      }
    }
    canvasStore.carveFog(exploredCells);

    // 8. Ignite Combat Tracker
    combatStore.igniteCombat(encounter.title, combatRoster);

    // 9. Trigger Audio Ambience (Forest wind + low tension drone)
    try {
      audioEngine.playSfx('sfx-wind');
    } catch {}

    // 10. Switch Tab to Tactical Battlemat
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:switch-tab', { detail: { tab: 'battlemat', view: 'canvas' } })
      );
    }

    return {
      success: true,
      encounterId: encounter.id,
      combatantCount: combatRoster.length,
      wallCount: encounter.walls.length,
    };
  } catch (error) {
    console.error('[EncounterLoader] Failed to load encounter:', error);
    return {
      success: false,
      encounterId,
      combatantCount: 0,
      wallCount: 0,
    };
  }
}
