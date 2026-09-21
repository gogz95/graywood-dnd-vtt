<!-- src/lib/components/navigation/OmnibarPalette.svelte -->
<!-- Global Omnibar Search & Command Palette (Ctrl+K / Cmd+K) -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { compendiumDb, type CompendiumMonster } from '../../db/compendiumDb';
  import { mapsDb } from '../../db/mapsDb';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { projectorStore, type ProjectorCastSource } from '../../stores/projectorStore.svelte';
  import StatblockView from '../bestiary/StatblockView.svelte';

  export interface OmnibarItem {
    id: string;
    category: 'spell' | 'monster' | 'subclass' | 'facility' | 'poi' | 'command';
    icon: string;
    title: string;
    subtitle: string;
    action: () => void;
  }

  let isOpen = $state(false);
  let query = $state('');
  let selectedIndex = $state(0);
  let results = $state<OmnibarItem[]>([]);
  let inputEl = $state<HTMLInputElement | null>(null);
  let inspectingMonster = $state<CompendiumMonster | null>(null);

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        query = '';
        selectedIndex = 0;
        setTimeout(() => inputEl?.focus(), 50);
      }
    } else if (e.key === 'Escape' && isOpen) {
      isOpen = false;
    } else if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % Math.max(1, results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + results.length) % Math.max(1, results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          results[selectedIndex].action();
        }
      }
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  $effect(() => {
    if (!isOpen) return;

    const q = query.trim();
    if (!q) {
      // Show default quick actions
      results = [
        {
          id: 'cmd-roll',
          category: 'command',
          icon: '🎲',
          title: '> roll [formula]',
          subtitle: 'Roll digital dice directly into session log (e.g. > roll 1d20 + 5)',
          action: () => {
            query = '> roll ';
            inputEl?.focus();
          },
        },
        {
          id: 'cmd-cast-bm',
          category: 'command',
          icon: '⚔️',
          title: '> cast battlemap',
          subtitle: 'Switch projector screen to Tactical Battlemat',
          action: () => {
            projectorStore.setCastingSource('battlemap');
            isOpen = false;
          },
        },
        {
          id: 'cmd-cast-atlas',
          category: 'command',
          icon: '🗺️',
          title: '> cast atlas',
          subtitle: 'Switch projector screen to World Atlas',
          action: () => {
            projectorStore.setCastingSource('atlas');
            isOpen = false;
          },
        },
        {
          id: 'cmd-cast-blackout',
          category: 'command',
          icon: '🌑',
          title: '> cast blackout',
          subtitle: 'Black out player projector screen instantly',
          action: () => {
            projectorStore.setCastingSource('blackout');
            isOpen = false;
          },
        },
      ];
      selectedIndex = 0;
      return;
    }

    // Command Mode: > prefix
    if (q.startsWith('>')) {
      const parts = q.slice(1).trim().split(/\s+/);
      const verb = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(' ');

      if (verb === 'roll') {
        const formula = arg || '1d20';
        results = [
          {
            id: 'exec-roll',
            category: 'command',
            icon: '🎲',
            title: `Roll: ${formula}`,
            subtitle: 'Press Enter to roll dice and post to chat',
            action: () => {
              chatStore.roll(formula, { label: 'Quick Omnibar Roll' });
              isOpen = false;
            },
          },
        ];
      } else if (verb === 'cast') {
        const target = (arg.toLowerCase() as ProjectorCastSource) || 'battlemap';
        results = [
          {
            id: 'exec-cast',
            category: 'command',
            icon: target === 'blackout' ? '🌑' : target === 'atlas' ? '🗺️' : '⚔️',
            title: `Cast to Projector: ${target}`,
            subtitle: 'Press Enter to update projector stream',
            action: () => {
              projectorStore.setCastingSource(target);
              isOpen = false;
            },
          },
        ];
      } else if (verb === 'goto') {
        results = [
          {
            id: 'exec-goto',
            category: 'command',
            icon: '🗺️',
            title: `Navigate to Map: "${arg}"`,
            subtitle: 'Press Enter to switch active scene',
            action: () => {
              isOpen = false;
            },
          },
        ];
      }
      selectedIndex = 0;
      return;
    }

    // Indexed concurrent Compendium & Atlas POI search
    (async () => {
      const lower = q.toLowerCase();
      const items: OmnibarItem[] = [];

      try {
        // Spells
        const spells = await compendiumDb.spells
          .filter(s => s.name.toLowerCase().includes(lower))
          .limit(4)
          .toArray();
        for (const s of spells) {
          items.push({
            id: s.id,
            category: 'spell',
            icon: '✨',
            title: s.name,
            subtitle: `Level ${s.level} ${s.school} · ${s.castingTime}`,
            action: () => {
              chatStore.sendMessage(`📖 **Spell:** ${s.name} (Level ${s.level} ${s.school})\n${s.description.slice(0, 200)}…`, 'System');
              isOpen = false;
            },
          });
        }

        // Monsters
        const monsters = await compendiumDb.monsters
          .filter(m => m.name.toLowerCase().includes(lower))
          .limit(4)
          .toArray();
        for (const m of monsters) {
          items.push({
            id: m.id,
            category: 'monster',
            icon: '🐉',
            title: m.name,
            subtitle: `CR ${m.cr} · AC ${m.ac} · HP ${m.hp} (${m.type})`,
            action: () => {
              inspectingMonster = m;
              isOpen = false;
            },
          });
        }

        // Atlas POI Pins
        const atlases = await mapsDb.atlasMaps.toArray();
        for (const atlas of atlases) {
          const matchingPins = atlas.poiPins.filter(p => p.label.toLowerCase().includes(lower));
          for (const pin of matchingPins.slice(0, 3)) {
            items.push({
              id: pin.id,
              category: 'poi',
              icon: '📍',
              title: pin.label,
              subtitle: `POI on ${atlas.name} · ${pin.description || 'Settlement'}`,
              action: () => {
                projectorStore.setActiveMap(atlas.id);
                projectorStore.setCastingSource('atlas');
                isOpen = false;
              },
            });
          }
        }
      } catch {
        // search query fallback
      }

      results = items;
      selectedIndex = 0;
    })();
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24 px-4 select-none animate-in fade-in duration-100"
    role="presentation"
    onclick={() => isOpen = false}
  >
    <!-- Modal Container -->
    <div
      class="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Omnibar Search"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Search Input Bar -->
      <div class="p-3 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
        <span class="text-slate-400 text-lg">🔍</span>
        <input
          bind:this={inputEl}
          type="text"
          bind:value={query}
          placeholder="Search SRD spells, monsters, atlas POIs, or type '>' for commands…"
          class="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 text-sm font-semibold focus:outline-none"
        />
        <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
          ESC
        </span>
      </div>

      <!-- Results List -->
      <div class="max-h-80 overflow-y-auto p-2 space-y-1">
        {#if results.length === 0}
          <div class="py-8 text-center text-slate-500 text-xs font-semibold">
            No matching entities or commands found.
          </div>
        {:else}
          {#each results as item, idx (item.id)}
            {@const isSel = idx === selectedIndex}
            <div
              role="button"
              tabindex="0"
              onclick={() => item.action()}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.action(); } }}
              onmouseenter={() => selectedIndex = idx}
              class="flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all {isSel
                ? 'bg-indigo-600 text-white shadow-md'
                : 'hover:bg-slate-800/70 text-slate-300'}"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-lg shrink-0">{item.icon}</span>
                <div class="min-w-0">
                  <span class="font-bold text-xs block truncate leading-tight {isSel ? 'text-white' : 'text-slate-200'}">
                    {item.title}
                  </span>
                  <span class="text-[10px] truncate block leading-tight {isSel ? 'text-indigo-200' : 'text-slate-400'}">
                    {item.subtitle}
                  </span>
                </div>
              </div>

              <span class="text-[10px] uppercase font-bold shrink-0 px-2 py-0.5 rounded {isSel ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-950 text-slate-400'}">
                {item.category}
              </span>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer Quick Tips -->
      <div class="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between font-mono">
        <span><b class="text-slate-400">↑↓</b> Navigate</span>
        <span><b class="text-slate-400">ENTER</b> Select</span>
        <span><b class="text-slate-400">&gt; roll [x]</b> Quick Dice</span>
      </div>
    </div>
  </div>
{/if}

{#if inspectingMonster}
  <div
    class="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
  >
    <StatblockView
      monster={inspectingMonster}
      onClose={() => inspectingMonster = null}
    />
  </div>
{/if}
