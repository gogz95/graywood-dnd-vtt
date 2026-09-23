import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ingestUniversalFile, ingestionProgressStore } from './universalIngestionEngine';
import { importUniversalMap } from '../services/mapImporter';
import { sourceDb } from '../db/sourceStore';
import { mapsDb } from '../db/mapsDb';
import { compendiumDb } from '../db/compendiumDb';
import { routeAsset } from '../services/ingest/subsystemRouter';
import type { IngestQueueItem } from '../services/ingest/ingestTypes';

describe('Source Ingestion Engine & Map Importer Pipeline', () => {
  beforeEach(async () => {
    await sourceDb.documents.clear();
    await sourceDb.chunks.clear();
    await mapsDb.tacticalMaps.clear();
    await mapsDb.atlasMaps.clear();
    await compendiumDb.monsters.clear();
    await compendiumDb.spells.clear();
  });

  it('parses UVTT (.dd2vtt / .uvtt) battlemap and extracts grid, dimensions, walls, doors, and lights', async () => {
    const sampleUvtt = {
      format: 0.2,
      resolution: {
        map_origin: { x: 0, y: 0 },
        map_size: { x: 20, y: 15 },
        pixels_per_grid: 70
      },
      line_of_sight: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 }
        ],
        [
          { x: 12, y: 0 },
          { x: 20, y: 0 }
        ]
      ],
      portals: [
        {
          position: { x: 10.5, y: 5 },
          bounds: [{ x: 10, y: 4 }, { x: 10, y: 6 }],
          rotation: 0,
          closed: true,
          freestanding: false
        }
      ],
      lights: [
        {
          position: { x: 5, y: 5 },
          range: 20,
          intensity: 0.8,
          color: '#ffaa44',
          shadows: true
        }
      ],
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };

    const uvttBlob = new Blob([JSON.stringify(sampleUvtt)], { type: 'application/json' });
    const result = await importUniversalMap(uvttBlob, 'ancient_tomb.dd2vtt');

    expect(result.success).toBe(true);
    expect(result.format).toBe('uvtt');
    expect(result.gridSize).toBe(70);
    // 2 segments from first polyline + 1 segment from second polyline = 3 LOS wall segments
    expect(result.wallsCount).toBe(3);
    expect(result.lightsCount).toBe(1);

    // Verify written to mapsDb
    const savedMaps = await mapsDb.tacticalMaps.toArray();
    expect(savedMaps.length).toBe(1);
    expect(savedMaps[0].name).toBe('ancient_tomb');
    expect(savedMaps[0].grid.sizePx).toBe(70);
    expect(savedMaps[0].walls.length).toBe(3);

    // Verify pixel coordinate scaling (x * 70, y * 70)
    expect(savedMaps[0].walls[0].p1.x).toBe(0);
    expect(savedMaps[0].walls[0].p2.x).toBe(700); // 10 * 70
  });

  it('tokenizes Markdown source document into searchable chunks and extracts 5e statblocks', async () => {
    const sampleMd = `# Chapter 3: Ancient Lore of Graywood

The whispering woods are guarded by ancient spirits that observe travelers from the mist.

## Dread Shadow
*Medium undead, neutral evil*
- **Armor Class** 13
- **Hit Points** 45 (7d8 + 14)
- **Speed** 40 ft.
- **Challenge** 3 (700 XP)

### Actions
**Shadow Touch.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 10 (2d6 + 3) necrotic damage.
`;

    const mdBlob = new Blob([sampleMd], { type: 'text/markdown' });
    const fileResult = await ingestUniversalFile(mdBlob, 'graywood_lore.md');

    expect(fileResult.length).toBe(1);
    expect(fileResult[0].success).toBe(true);
    expect(fileResult[0].chunksCount).toBeGreaterThanOrEqual(1);

    // Verify stored in sourceDb
    const docs = await sourceDb.documents.toArray();
    expect(docs.length).toBe(1);
    expect(docs[0].name).toBe('graywood_lore.md');

    const chunks = await sourceDb.chunks.toArray();
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].text).toContain('whispering woods');

    // Test routing through subsystemRouter
    const queueItem: IngestQueueItem = {
      id: 'test-item-1',
      name: 'graywood_lore.md',
      relativePath: 'Ingest/Source material/graywood_lore.md',
      category: 'source',
      extension: 'md',
      sizeBytes: sampleMd.length,
      mimeType: 'text/markdown',
      file: mdBlob,
      status: 'queued',
      progress: 0
    };

    let reportedPercent = 0;
    const routeRes = await routeAsset(queueItem, (pct) => { reportedPercent = pct; });
    expect(routeRes.success).toBe(true);
    expect(reportedPercent).toBeGreaterThanOrEqual(40);

    // Verify extracted monster into compendiumDb
    const monsters = await compendiumDb.monsters.toArray();
    expect(monsters.length).toBeGreaterThanOrEqual(1);
    const dreadShadow = monsters.find(m => m.name.toLowerCase().includes('dread shadow'));
    expect(dreadShadow).toBeDefined();
    expect(dreadShadow?.cr).toBe(3);
    expect(dreadShadow?.ac).toBe(13);
  });

  it('fails gracefully on invalid or corrupted files without throwing', async () => {
    const corruptBlob = new Blob(['{ invalid_json::: truncated'], { type: 'application/json' });
    const mapResult = await importUniversalMap(corruptBlob, 'corrupted_map.dd2vtt');

    expect(mapResult.success).toBe(false);
    expect(mapResult.error).toBeDefined();
    expect(mapResult.error).toContain('Failed to parse map JSON');

    const ingestResult = await ingestUniversalFile(corruptBlob, 'corrupted_archive.zip');
    expect(ingestResult[0].success).toBe(false);
    expect(ingestResult[0].error).toBeDefined();
  });
});
