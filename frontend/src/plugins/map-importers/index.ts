import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import { dexieDb } from '$lib/db/dexieDb';
import type { MapSceneData } from '$lib/types/viewport';
import {
  parseUvttFile,
  parseWatabouGeoJson,
  parseDungeonScrawlJson
} from './services/uvttParser';

export { parseUvttFile, parseWatabouGeoJson, parseDungeonScrawlJson };

export const mapImportersPlugin: VttPlugin = {
  id: 'map-importers',
  name: 'Universal VTT & Procedural Map Ingest',
  version: '1.0.0',
  description: 'Import Universal VTT (.uvtt / .dd2vtt), Watabou City GeoJSON, and Dungeon Scrawl maps',
  enabledByDefault: true,
  slots: [
    {
      slot: 'header_action',
      title: 'Import Map (.uvtt / GeoJSON)',
      icon: 'map-pin',
      mount(container: HTMLElement, context: PluginContext) {
        const btn = document.createElement('button');
        btn.className =
          'px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm';
        btn.title = 'Import Map (.uvtt / .dd2vtt / GeoJSON)';
        btn.innerHTML = `<svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg><span>Import Map</span>`;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.uvtt,.dd2vtt,.json,.geojson';
        fileInput.style.display = 'none';

        async function processFile(file: File) {
          try {
            const text = await file.text();
            const rawJson = JSON.parse(text);

            let scene: MapSceneData;
            if (rawJson.line_of_sight || rawJson.resolution?.pixels_per_grid || rawJson.format) {
              scene = await parseUvttFile(rawJson);
            } else if (rawJson.lines) {
              scene = parseDungeonScrawlJson(rawJson);
            } else if (rawJson.features || rawJson.type === 'FeatureCollection') {
              const city = parseWatabouGeoJson(rawJson);
              scene = {
                id: city.cityId,
                name: city.cityName,
                type: 'overland_atlas',
                grid: { type: 'none', size: 50, scaleFeet: 10 }
              };
            } else {
              throw new Error('Unrecognized map file format.');
            }

            await dexieDb.scenes.put({
              id: scene.id,
              name: scene.name,
              type: scene.type,
              gridSize: scene.grid.size,
              scaleFeet: scene.grid.scaleFeet,
              assetUrl: scene.assetUrl
            });

            context.emit('SCENE_CREATED', scene, true);
            context.emit('NOTIFICATION', {
              type: 'success',
              title: 'Map Imported',
              message: `Successfully imported "${scene.name}".`
            });
          } catch (err) {
            console.error('[mapImporters] Import failed:', err);
            context.emit('NOTIFICATION', {
              type: 'error',
              title: 'Import Failed',
              message: err instanceof Error ? err.message : 'Invalid map file format.'
            });
          }
        }

        btn.onclick = () => fileInput.click();

        fileInput.onchange = (e: Event) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (file) {
            processFile(file);
            fileInput.value = '';
          }
        };

        btn.ondragover = (e) => {
          e.preventDefault();
          btn.classList.add('border-indigo-500');
        };
        btn.ondragleave = () => {
          btn.classList.remove('border-indigo-500');
        };
        btn.ondrop = (e) => {
          e.preventDefault();
          btn.classList.remove('border-indigo-500');
          const file = e.dataTransfer?.files?.[0];
          if (file) processFile(file);
        };

        container.appendChild(btn);
        container.appendChild(fileInput);

        return {
          destroy: () => {
            btn.remove();
            fileInput.remove();
          }
        };
      }
    }
  ]
};
