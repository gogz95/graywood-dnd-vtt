// src/lib/services/campaignBundleService.ts
// Full Campaign Import / Export Engine (.vttbundle archive)
// Packages Dexie IndexedDB tables (MapsDatabase, CompendiumDatabase), active rules, and session state.

import JSZip from 'jszip';
import { mapsDb } from '../db/mapsDb';
import { compendiumDb } from '../db/compendiumDb';
import { systemBus } from './systemBus';

export interface CampaignBundleManifest {
  version: '1.0';
  exportedAt: number;
  campaignName: string;
  counts: {
    tacticalMaps: number;
    atlasMaps: number;
    spells: number;
    monsters: number;
    subclasses: number;
    facilities: number;
  };
}

const SESSION_STORAGE_KEYS = [
  'vtt_active_rules',
  'vtt_party_roster',
  'vtt_party_stash',
  'vtt_encounters',
  'vtt_campaign_name',
  'vtt_dm_name',
  'vtt_active_pin',
  'vtt_projector_state',
  'vtt_canvas_state',
];

/**
 * Exports entire campaign database and session storage into a .vttbundle ZIP archive.
 */
export async function exportCampaignBundle(): Promise<Blob> {
  const zip = new JSZip();

  // 1. Fetch Dexie Maps Database
  const tacticalMaps = await mapsDb.tacticalMaps.toArray();
  const atlasMaps = await mapsDb.atlasMaps.toArray();

  // 2. Fetch Dexie Compendium Database
  const spells = await compendiumDb.spells.toArray();
  const monsters = await compendiumDb.monsters.toArray();
  const subclasses = await compendiumDb.subclasses.toArray();
  const facilities = await compendiumDb.facilities.toArray();

  // 3. Collect Local Storage Session States
  const sessionData: Record<string, any> = {};
  if (typeof localStorage !== 'undefined') {
    for (const key of SESSION_STORAGE_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try {
          sessionData[key] = JSON.parse(val);
        } catch {
          sessionData[key] = val;
        }
      }
    }
  }

  const campaignName = sessionData['vtt_campaign_name'] || 'Campaign';

  const manifest: CampaignBundleManifest = {
    version: '1.0',
    exportedAt: Date.now(),
    campaignName,
    counts: {
      tacticalMaps: tacticalMaps.length,
      atlasMaps: atlasMaps.length,
      spells: spells.length,
      monsters: monsters.length,
      subclasses: subclasses.length,
      facilities: facilities.length,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('maps.json', JSON.stringify({ tacticalMaps, atlasMaps }, null, 2));
  zip.file('compendium.json', JSON.stringify({ spells, monsters, subclasses, facilities }, null, 2));
  zip.file('session.json', JSON.stringify(sessionData, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/octet-stream',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Transactionally restores all tables and session keys from a .vttbundle File.
 */
export async function importCampaignBundle(bundleFile: File | Blob): Promise<void> {
  const zip = await JSZip.loadAsync(bundleFile);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid .vttbundle: missing manifest.json');
  }

  // 1. Restore Maps Database
  const mapsJsonFile = zip.file('maps.json');
  if (mapsJsonFile) {
    const rawMaps = await mapsJsonFile.async('string');
    const { tacticalMaps, atlasMaps } = JSON.parse(rawMaps);

    await mapsDb.transaction('rw', [mapsDb.tacticalMaps, mapsDb.atlasMaps], async () => {
      await mapsDb.tacticalMaps.clear();
      await mapsDb.atlasMaps.clear();
      if (tacticalMaps?.length) await mapsDb.tacticalMaps.bulkPut(tacticalMaps);
      if (atlasMaps?.length) await mapsDb.atlasMaps.bulkPut(atlasMaps);
    });
  }

  // 2. Restore Compendium Database
  const compendiumJsonFile = zip.file('compendium.json');
  if (compendiumJsonFile) {
    const rawComp = await compendiumJsonFile.async('string');
    const { spells, monsters, subclasses, facilities } = JSON.parse(rawComp);

    await compendiumDb.transaction(
      'rw',
      [compendiumDb.spells, compendiumDb.monsters, compendiumDb.subclasses, compendiumDb.facilities],
      async () => {
        await compendiumDb.spells.clear();
        await compendiumDb.monsters.clear();
        await compendiumDb.subclasses.clear();
        await compendiumDb.facilities.clear();

        if (spells?.length) await compendiumDb.spells.bulkPut(spells);
        if (monsters?.length) await compendiumDb.monsters.bulkPut(monsters);
        if (subclasses?.length) await compendiumDb.subclasses.bulkPut(subclasses);
        if (facilities?.length) await compendiumDb.facilities.bulkPut(facilities);
      }
    );
  }

  // 3. Restore Local Storage Session
  const sessionJsonFile = zip.file('session.json');
  if (sessionJsonFile && typeof localStorage !== 'undefined') {
    const rawSession = await sessionJsonFile.async('string');
    const sessionData = JSON.parse(rawSession);

    for (const [key, val] of Object.entries(sessionData)) {
      if (typeof val === 'string') {
        localStorage.setItem(key, val);
      } else {
        localStorage.setItem(key, JSON.stringify(val));
      }
    }
  }

  // 4. Trigger system bus reload
  systemBus.emit('SCENE_CHANGE', {
    mapId: 'restored',
    mapType: 'tactical',
    name: 'Campaign Restored',
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:campaign-reloaded'));
    window.dispatchEvent(new CustomEvent('vtt:roster-updated'));
  }
}
