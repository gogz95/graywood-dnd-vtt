<!-- frontend/src/lib/components/navigation/CommandPalette.svelte -->
<!-- Tactical DM Command Palette & Universal Compendium Search (Ctrl+K) -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { compendiumDb, type CompendiumMonster, type CompendiumSpell, type CompendiumItem } from '../../db/compendiumDb';
  import { mapsDb } from '../../db/mapsDb';
  import { campaignDirectoryStore } from '../../stores/campaignDirectoryStore.svelte';
  import { combatStore } from '../../stores/combatStore.svelte';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { uiStore } from '../../stores/uiStore.svelte';
  import StatblockView from '../bestiary/StatblockView.svelte';
  import {
    generateCharacterName,
    generateEstablishmentName,
    quickAddNpcToRoster,
    type FantasyRace,
    type EstablishmentType,
  } from '../../services/nameGeneratorService';

  export interface CommandItem {
    id: string;
    category: 'spell' | 'monster' | 'item' | 'map' | 'combat' | 'audio' | 'navigation' | 'generator';
    icon: string;
    title: string;
    subtitle: string;
    badge?: string;
    quickAction?: { label: string; action: () => void };
    action: () => void;
  }

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let results = $state<CommandItem[]>([]);
  let inputEl = $state<HTMLInputElement | null>(null);
  let inspectingMonster = $state<CompendiumMonster | null>(null);

  export function open() {
    isOpen = true;
    query = '';
    selectedIndex = 0;
    setTimeout(() => inputEl?.focus(), 40);
  }

  export function close() {
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
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

  // Pre-configured tactical commands
  const defaultCommands: CommandItem[] = [
    {
      id: 'cmd-next-turn',
      category: 'combat',
      icon: '⚔️',
      title: 'Combat: Next Turn',
      subtitle: 'Advance initiative order to the next combatant',
      badge: 'Action',
      action: () => {
        combatStore.nextTurn();
        chatStore.sendMessage('⚔️ **Combat:** Advanced to next turn', 'System');
        close();
      }
    },
    {
      id: 'cmd-reset-combat',
      category: 'combat',
      icon: '🔄',
      title: 'Combat: Reset / End Combat',
      subtitle: 'Clear all active combatants and reset round tracker',
      badge: 'Danger',
      action: () => {
        combatStore.endCombat();
        chatStore.sendMessage('🔄 **Combat:** Initiative encounter ended and cleared', 'System');
        close();
      }
    },
    {
      id: 'cmd-blackout',
      category: 'navigation',
      icon: '🌑',
      title: 'Projector: Toggle Blackout Curtain',
      subtitle: 'Instantly black out or restore player projector screen (Ctrl+Shift+B)',
      badge: 'Screen',
      action: () => {
        projectorStore.toggleBlackout();
        close();
      }
    },
    {
      id: 'cmd-play-tavern',
      category: 'audio',
      icon: '🍻',
      title: 'Audio: Play Tavern Ambience',
      subtitle: 'Trigger warm ambient tavern soundscape & acoustic murmur',
      badge: 'Sound',
      action: () => {
        window.dispatchEvent(new CustomEvent('vtt:play-preset-ambience', { detail: { id: 'amb-tavern' } }));
        audioEngine.triggerSfx('sfx-bell');
        close();
      }
    },
    {
      id: 'cmd-stop-audio',
      category: 'audio',
      icon: '⏹️',
      title: 'Audio: Stop All Audio',
      subtitle: 'Immediately cease looping ambience tracks and active SFX',
      badge: 'Mute',
      action: () => {
        audioEngine.stopTrack();
        window.dispatchEvent(new CustomEvent('vtt:stop-all-ambience'));
        close();
      }
    },
    {
      id: 'cmd-roll-dice',
      category: 'navigation',
      icon: '🎲',
      title: 'Dice: Roll Formula',
      subtitle: 'Type "roll 1d20+5" or "roll 8d6" to roll digital 3D dice',
      badge: 'Roll',
      action: () => {
        query = 'roll ';
        inputEl?.focus();
      }
    }
  ];

  $effect(() => {
    if (!isOpen) return;

    const q = query.trim().toLowerCase();
    if (!q) {
      results = defaultCommands;
      selectedIndex = 0;
      return;
    }

    if (q.startsWith('roll ')) {
      const formula = q.slice(5).trim() || '1d20';
      results = [
        {
          id: 'exec-roll',
          category: 'navigation',
          icon: '🎲',
          title: `Roll: ${formula}`,
          subtitle: 'Press Enter to roll dice and post results to session log',
          action: () => {
            chatStore.roll(formula, { label: 'Command Palette Roll' });
            close();
          }
        }
      ];
      selectedIndex = 0;
      return;
    }

    // Concurrent fuzzy / prefix search across compendium, maps, audio, combat
    (async () => {
      const items: CommandItem[] = [];

      // 1. Combat actions
      if ('next turn'.includes(q) || 'combat'.includes(q)) {
        items.push(defaultCommands[0]);
      }
      if ('reset'.includes(q) || 'end combat'.includes(q) || 'clear combat'.includes(q)) {
        items.push(defaultCommands[1]);
      }

      // 2. Audio triggers
      if ('tavern'.includes(q) || 'play tavern'.includes(q) || 'music'.includes(q) || 'audio'.includes(q)) {
        items.push(defaultCommands[3]);
      }
      if ('stop audio'.includes(q) || 'mute'.includes(q) || 'silence'.includes(q)) {
        items.push(defaultCommands[4]);
      }

      // Procedural Name & Improv Generators
      const RACES: FantasyRace[] = ['Dwarf', 'Elf', 'Human', 'Orc', 'Tiefling', 'Halfling'];
      const ESTABLISHMENTS: EstablishmentType[] = ['Tavern', 'General Store', 'Blacksmith', 'Ship'];

      if (q.includes('name') || q.includes('npc') || q.includes('improv') || RACES.some(r => r.toLowerCase().includes(q))) {
        for (const race of RACES) {
          if (q.includes('name') || q.includes('npc') || race.toLowerCase().includes(q)) {
            const gen = generateCharacterName(race);
            items.push({
              id: `gen-${race}-${Date.now()}`,
              category: 'generator',
              icon: race === 'Elf' ? '🧝' : race === 'Dwarf' ? '🧔' : race === 'Orc' ? '👹' : '👤',
              title: `${gen.fullName} (${race} NPC)`,
              subtitle: `Procedural ${race} Name · Click to copy or Quick-Add to combat roster`,
              badge: race,
              quickAction: {
                label: '+ Quick Add NPC to Roster',
                action: () => {
                  quickAddNpcToRoster(gen.fullName, race);
                  close();
                }
              },
              action: () => {
                if (typeof navigator !== 'undefined') navigator.clipboard.writeText(gen.fullName);
                chatStore.sendMessage(`Generated NPC: **${gen.fullName}** (${race})`, 'System');
                close();
              }
            });
          }
        }
      }

      if (q.includes('tavern') || q.includes('store') || q.includes('shop') || q.includes('blacksmith') || q.includes('ship') || q.includes('place')) {
        for (const est of ESTABLISHMENTS) {
          if (q.includes('place') || est.toLowerCase().includes(q)) {
            const estName = generateEstablishmentName(est);
            items.push({
              id: `gen-${est}-${Date.now()}`,
              category: 'generator',
              icon: est === 'Tavern' ? '🍺' : est === 'Ship' ? '⛵' : est === 'Blacksmith' ? '⚒️' : '🏬',
              title: estName,
              subtitle: `Procedural ${est} · Click to post into session chat`,
              badge: est,
              action: () => {
                if (typeof navigator !== 'undefined') navigator.clipboard.writeText(estName);
                chatStore.sendMessage(`Generated Establishment: **${estName}** (${est})`, 'System');
                close();
              }
            });
          }
        }
      }

      try {
        // 4. Ingested Maps
        const tacticalMaps = await mapsDb.tacticalMaps.toArray();
        for (const map of tacticalMaps) {
          if (map.name.toLowerCase().includes(q)) {
            items.push({
              id: `map-${map.id}`,
              category: 'map',
              icon: '🗺️',
              title: map.name,
              subtitle: `Tactical Battlemap · ${map.grid.sizePx}px grid (${map.grid.type})`,
              badge: 'Battlemap',
              action: () => {
                projectorStore.setActiveMap(map.id);
                projectorStore.setCastingSource('battlemap');
                localStorage.setItem('vtt_active_battlemap_id', map.id);
                window.dispatchEvent(new CustomEvent('vtt:select-map', { detail: { id: map.id } }));
                close();
              }
            });
          }
        }

        // Campaign directory map assets
        for (const file of campaignDirectoryStore.mapFiles) {
          const fileName = file.split(/[\\/]/).pop() || file;
          if (fileName.toLowerCase().includes(q) && !items.some(i => i.title.toLowerCase() === fileName.toLowerCase())) {
            items.push({
              id: `file-map-${file}`,
              category: 'map',
              icon: '🗺️',
              title: fileName,
              subtitle: `Campaign Asset: ${file}`,
              badge: 'File',
              action: () => {
                window.dispatchEvent(new CustomEvent('vtt:load-map-asset', { detail: { path: file } }));
                close();
              }
            });
          }
        }

        // 5. Spells
        const spells = await compendiumDb.spells
          .filter(s => s.name.toLowerCase().includes(q))
          .limit(4)
          .toArray();
        for (const s of spells) {
          items.push({
            id: s.id,
            category: 'spell',
            icon: '✨',
            title: s.name,
            subtitle: `Level ${s.level} ${s.school} · ${s.castingTime}`,
            badge: 'Spell',
            action: () => {
              chatStore.sendMessage(`📖 **Spell:** ${s.name} (Level ${s.level} ${s.school})\n${s.description.slice(0, 220)}…`, 'System');
              close();
            }
          });
        }

        // 6. Monsters
        const monsters = await compendiumDb.monsters
          .filter(m => m.name.toLowerCase().includes(q))
          .limit(4)
          .toArray();
        for (const m of monsters) {
          items.push({
            id: m.id,
            category: 'monster',
            icon: '🐉',
            title: m.name,
            subtitle: `CR ${m.cr} · AC ${m.ac} · HP ${m.hp} (${m.type})`,
            badge: 'Monster',
            action: () => {
              inspectingMonster = m;
              close();
            }
          });
        }

        // 7. Items
        const compItems = await compendiumDb.items
          .filter(i => i.name.toLowerCase().includes(q))
          .limit(4)
          .toArray();
        for (const it of compItems) {
          items.push({
            id: it.id,
            category: 'item',
            icon: '🛡️',
            title: it.name,
            subtitle: `${it.rarity} ${it.type} · ${it.damage || it.armorClass ? `Stats: ${it.damage || it.armorClass}` : it.cost || 'Equipment'}`,
            badge: 'Item',
            action: () => {
              chatStore.sendMessage(`🛡️ **Item:** ${it.name} (${it.rarity} ${it.type})\n${it.description.slice(0, 200)}…`, 'System');
              close();
            }
          });
        }
      } catch (err) {
        console.warn('CommandPalette search query error:', err);
      }

      results = items;
      selectedIndex = 0;
    })();
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4 select-none animate-in fade-in duration-100"
    role="presentation"
    onclick={() => close()}
  >
    <!-- Modal Window -->
    <div
      class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
      role="dialog"
      tabindex="-1"
      aria-label="Tactical Command Palette"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Search Input Header -->
      <div class="flex items-center gap-3 px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <span class="text-lg text-indigo-400">⚡</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          placeholder="Type a command, spell, monster, item, map, or 'roll 2d6+4'..."
          class="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none font-medium"
        />
        <div class="flex items-center gap-1.5">
          <kbd class="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700 rounded shadow-xs">ESC</kbd>
          <button
            type="button"
            onclick={() => close()}
            class="text-slate-400 hover:text-slate-100 p-1 rounded-md text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Quick Action / Query Results List -->
      <div class="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-1">
        {#if results.length === 0}
          <div class="py-12 text-center text-slate-500 text-xs font-mono">
            No matching compendium entries, maps, or commands found for "{query}"
          </div>
        {:else}
          {#each results as item, index}
            <div
              role="button"
              tabindex="0"
              class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all {selectedIndex === index ? 'bg-indigo-600/20 border border-indigo-500/50 shadow-sm' : 'hover:bg-slate-800/60 border border-transparent'}"
              onmouseenter={() => (selectedIndex = index)}
              onclick={() => item.action()}
              onkeydown={(e) => { if (e.key === 'Enter') item.action(); }}
            >
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-xl shrink-0">{item.icon}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-slate-200 truncate">{item.title}</span>
                    {#if item.badge}
                      <span class="px-1.5 py-0.2 text-[9px] uppercase tracking-wider font-bold rounded-md bg-slate-800 text-slate-400 border border-slate-700/60">
                        {item.badge}
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-slate-400 truncate">{item.subtitle}</p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                {#if item.quickAction}
                  <button
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      item.quickAction!.action();
                    }}
                    class="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold transition-colors shadow flex items-center gap-1"
                  >
                    <span>⚔️</span>
                    <span>{item.quickAction.label}</span>
                  </button>
                {/if}

                {#if selectedIndex === index}
                  <span class="text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-700/40 px-2 py-0.5 rounded">
                    ↵ Enter
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer Help Hints -->
      <div class="px-4 py-2 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span>Navigate <kbd class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">↑</kbd> <kbd class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">↓</kbd></span>
          <span>Select <kbd class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">Enter</kbd></span>
          <span>Close <kbd class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">Esc</kbd></span>
        </div>
        <span class="text-indigo-400/80 font-mono text-[10px]">Tactical DM Omnibar</span>
      </div>
    </div>
  </div>
{/if}

<!-- Standalone Monster Inspection Modal -->
{#if inspectingMonster}
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100"
    role="presentation"
    onclick={() => (inspectingMonster = null)}
  >
    <div
      class="w-full max-w-xl max-h-[85vh] bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-y-auto p-4"
      role="dialog"
      tabindex="-1"
      aria-label="{inspectingMonster.name} Statblock"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
        <h2 class="text-base font-black text-amber-400 uppercase tracking-wider">
          {inspectingMonster.name} Statblock
        </h2>
        <button
          type="button"
          onclick={() => (inspectingMonster = null)}
          class="p-1 rounded text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      <StatblockView monster={inspectingMonster} />
    </div>
  </div>
{/if}
