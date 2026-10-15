import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import {
  normalizeDdbCharacter,
  mirrorRemoteAvatar,
  actorStore
} from './services/ddbNormalizer';

export { normalizeDdbCharacter, mirrorRemoteAvatar, actorStore };

export const dndBeyondPlugin: VttPlugin = {
  id: 'dnd-beyond',
  name: 'D&D Beyond Importer & Sync',
  version: '1.0.0',
  description: 'D&D Beyond character URL/ID sync, schema normalization, and media caching',
  enabledByDefault: true,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'D&D Beyond Sync',
      icon: 'cloud-download',
      mount(container: HTMLElement, context: PluginContext) {
        const root = document.createElement('div');
        root.className = 'p-4 flex flex-col gap-4 text-slate-200 text-sm overflow-y-auto h-full';

        root.innerHTML = `
          <div class="border-b border-slate-700/80 pb-3">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-red-400 font-serif font-black tracking-wider">D&D</span> Beyond Sync
            </h2>
            <p class="text-xs text-slate-400 mt-1">
              Import and synchronize character sheets, stats, and avatars directly from D&D Beyond.
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-300">Character URL or ID</label>
            <input
              id="ddb-char-input"
              type="text"
              placeholder="e.g. 10293847 or https://www.dndbeyond.com/characters/..."
              class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-300 flex justify-between">
              <span>Cobalt Session Token</span>
              <span class="text-[10px] text-slate-500 font-normal">Optional (Private Sheets)</span>
            </label>
            <input
              id="ddb-token-input"
              type="password"
              placeholder="CobaltSession token stored locally on host"
              class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <details class="text-xs text-slate-400 cursor-pointer">
              <summary class="hover:text-slate-200 select-none">Or paste raw Character JSON</summary>
              <textarea
                id="ddb-json-input"
                rows="5"
                placeholder='Paste raw DDB JSON {"character": {...}} here'
                class="w-full mt-2 p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300 focus:outline-none focus:border-red-500"
              ></textarea>
            </details>
          </div>

          <button
            id="ddb-import-btn"
            class="w-full py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold rounded text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Sync & Normalize Character</span>
          </button>

          <div id="ddb-status" class="hidden p-3 rounded text-xs flex flex-col gap-1 border"></div>
        `;

        container.appendChild(root);

        const charInput = root.querySelector('#ddb-char-input') as HTMLInputElement;
        const tokenInput = root.querySelector('#ddb-token-input') as HTMLInputElement;
        const jsonInput = root.querySelector('#ddb-json-input') as HTMLTextAreaElement;
        const importBtn = root.querySelector('#ddb-import-btn') as HTMLButtonElement;
        const statusBox = root.querySelector('#ddb-status') as HTMLDivElement;

        // Restore cached cobalt token if present
        if (typeof localStorage !== 'undefined') {
          const cachedToken = localStorage.getItem('ddb_cobalt_session_token');
          if (cachedToken) tokenInput.value = cachedToken;
        }

        tokenInput.onchange = () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ddb_cobalt_session_token', tokenInput.value.trim());
          }
        };

        function showStatus(type: 'success' | 'error' | 'loading', msg: string) {
          statusBox.classList.remove('hidden', 'bg-green-950/60', 'border-green-800', 'text-green-300', 'bg-red-950/60', 'border-red-800', 'text-red-300', 'bg-slate-900', 'border-slate-700', 'text-slate-300');
          if (type === 'success') {
            statusBox.classList.add('bg-green-950/60', 'border-green-800', 'text-green-300');
          } else if (type === 'error') {
            statusBox.classList.add('bg-red-950/60', 'border-red-800', 'text-red-300');
          } else {
            statusBox.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300');
          }
          statusBox.textContent = msg;
        }

        async function handleImport() {
          const rawText = jsonInput.value.trim();
          const charUrlOrId = charInput.value.trim();
          const cobalt = tokenInput.value.trim();

          showStatus('loading', 'Importing and normalizing character data...');
          importBtn.disabled = true;

          try {
            let parsedData: any;

            if (rawText) {
              parsedData = JSON.parse(rawText);
            } else if (charUrlOrId) {
              const match = charUrlOrId.match(/(?:characters\/)?(\d+)/);
              const charId = match ? match[1] : charUrlOrId;
              if (!charId) throw new Error('Could not parse a valid Character ID.');

              const apiUrl = `https://character-service.dndbeyond.com/character/v2/character/${charId}`;
              let res: Response;
              try {
                res = await fetch(apiUrl, {
                  headers: cobalt ? { Authorization: `Bearer ${cobalt}` } : {}
                });
              } catch {
                res = await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`);
              }

              if (!res.ok) {
                throw new Error(`D&D Beyond API returned HTTP status ${res.status}.`);
              }

              parsedData = await res.json();
            } else {
              throw new Error('Please provide a Character URL, ID, or paste raw JSON.');
            }

            const actor = await normalizeDdbCharacter(parsedData);
            const ddbId = (actor.sheetData?.ddbId as string) || actor.id;

            // Save to actor store & tag Entity Blackboard metadata
            actorStore.setActor(actor);
            context.setMeta('actor', actor.id, 'dnd_beyond', {
              ddbId,
              lastSynced: Date.now()
            });

            context.emit('ACTOR_CREATED', actor, true);
            context.emit('NOTIFICATION', {
              type: 'success',
              title: 'D&D Beyond Sync',
              message: `Synced ${actor.name} (AC ${actor.vitals.ac}, HP ${actor.vitals.hpCurrent}/${actor.vitals.hpMax})`
            });

            showStatus(
              'success',
              `Successfully imported "${actor.name}"! HP: ${actor.vitals.hpCurrent}/${actor.vitals.hpMax}, AC: ${actor.vitals.ac}, Speed: ${actor.vitals.speedFt}ft.`
            );
          } catch (err) {
            console.error('[dndBeyondPlugin] Import failed:', err);
            const errMsg = err instanceof Error ? err.message : 'Character sync failed.';
            showStatus('error', errMsg);
            context.emit('NOTIFICATION', {
              type: 'error',
              title: 'D&D Beyond Import Error',
              message: errMsg
            });
          } finally {
            importBtn.disabled = false;
          }
        }

        importBtn.onclick = handleImport;

        return {
          destroy: () => {
            root.remove();
          }
        };
      }
    }
  ]
};
