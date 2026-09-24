<!-- src/lib/components/mobile/MobileSpellbook.svelte -->
<!-- Mobile Spell Slot Tracker & Spellbook with Bottom Sheet Spell Card & Quick Cast (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { compendiumDb, type CompendiumSpell } from '$lib/db/compendiumDb';

  interface Props {
    characterName: string;
    socket: WebSocket | null;
    spellSlots?: Record<number, { total: number; used: number }>;
    onCastSpell?: (spellName: string, level: number, rollFormula?: string) => void;
    onSlotsChanged?: (slots: Record<number, { total: number; used: number }>) => void;
  }

  let {
    characterName,
    socket,
    spellSlots = $bindable({
      1: { total: 4, used: 1 },
      2: { total: 3, used: 0 },
      3: { total: 2, used: 1 },
      4: { total: 0, used: 0 },
      5: { total: 0, used: 0 },
      6: { total: 0, used: 0 },
      7: { total: 0, used: 0 },
      8: { total: 0, used: 0 },
      9: { total: 0, used: 0 },
    }),
    onCastSpell,
    onSlotsChanged,
  }: Props = $props();

  // Spellbook items loaded from Dexie
  let spells = $state<CompendiumSpell[]>([]);
  let activeTabLevel = $state<number | 'all'>('all');
  let selectedSpell = $state<CompendiumSpell | null>(null);
  let searchQuery = $state('');

  // Fallback 5e baseline spells if Dexie table is initially populating
  const DEFAULT_PREPARED_SPELLS: CompendiumSpell[] = [
    {
      id: 'srd-fire-bolt',
      name: 'Fire Bolt',
      level: 0,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
    {
      id: 'srd-cure-wounds',
      name: 'Cure Wounds',
      level: 1,
      school: 'Evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
    {
      id: 'srd-magic-missile',
      name: 'Magic Missile',
      level: 1,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
    {
      id: 'srd-shield',
      name: 'Shield',
      level: 1,
      school: 'Abjuration',
      castingTime: '1 reaction',
      range: 'Self',
      components: 'V, S',
      duration: '1 round',
      description: 'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
    {
      id: 'srd-misty-step',
      name: 'Misty Step',
      level: 2,
      school: 'Conjuration',
      castingTime: '1 bonus action',
      range: 'Self',
      components: 'V',
      duration: 'Instantaneous',
      description: 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
    {
      id: 'srd-fireball',
      name: 'Fireball',
      level: 3,
      school: 'Evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.',
      sourceBook: '5e SRD 5.1',
      packageId: 'srd-5.1',
      origin: 'SRD-5.1',
    },
  ];

  onMount(async () => {
    try {
      const dbSpells = await compendiumDb.spells.limit(50).toArray();
      if (dbSpells && dbSpells.length > 0) {
        spells = dbSpells;
      } else {
        spells = DEFAULT_PREPARED_SPELLS;
      }
    } catch {
      spells = DEFAULT_PREPARED_SPELLS;
    }
  });

  // Filtered spells
  let filteredSpells = $derived.by(() => {
    let list = spells;
    if (activeTabLevel !== 'all') {
      list = list.filter((s) => s.level === activeTabLevel);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  // Grouped spells by level for headers
  let spellsByLevel = $derived.by(() => {
    const map = new Map<number, CompendiumSpell[]>();
    for (const spell of filteredSpells) {
      const arr = map.get(spell.level) || [];
      arr.push(spell);
      map.set(spell.level, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  });

  function toggleSlot(lvl: number, slotIndex: number) {
    const slot = spellSlots[lvl];
    if (!slot) return;
    if (slotIndex < slot.used) {
      // Restore slot
      slot.used = Math.max(0, slot.used - 1);
    } else {
      // Expend slot
      slot.used = Math.min(slot.total, slot.used + 1);
    }
    spellSlots = { ...spellSlots };
    onSlotsChanged?.(spellSlots);
  }

  function restoreAllSlots() {
    for (const lvl of Object.keys(spellSlots)) {
      const n = Number(lvl);
      if (spellSlots[n]) {
        spellSlots[n].used = 0;
      }
    }
    spellSlots = { ...spellSlots };
    onSlotsChanged?.(spellSlots);
  }

  function extractRollFormula(spell: CompendiumSpell): string | undefined {
    const desc = spell.description || '';
    // Look for damage dice like 8d6, 1d10, 3d8, etc.
    const match = desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
    if (match) {
      return match[1].replace(/\s+/g, '');
    }
    if (spell.level === 0) {
      return '1d20+5'; // Spell attack roll fallback
    }
    return undefined;
  }

  function handleCast(spell: CompendiumSpell) {
    if (spell.level > 0) {
      const slot = spellSlots[spell.level];
      if (slot && slot.total > 0 && slot.used < slot.total) {
        slot.used += 1;
        spellSlots = { ...spellSlots };
        onSlotsChanged?.(spellSlots);
      }
    }

    const formula = extractRollFormula(spell);
    if (formula && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'RollDice',
          expression: formula,
          character_name: `${characterName} (${spell.name})`,
        })
      );
    }

    onCastSpell?.(spell.name, spell.level, formula);
    selectedSpell = null;
  }
</script>

<div class="flex flex-col h-full space-y-4">
  <!-- ── SPELL SLOT TRACKER (Levels 1 to 9) ────────────────────────────────── -->
  <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-xl">
    <div class="flex items-center justify-between mb-2.5">
      <div class="flex items-center gap-2">
        <span class="text-sm">✨</span>
        <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">Spell Slots</h2>
      </div>
      <button
        type="button"
        onclick={restoreAllSlots}
        class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/40 px-2 py-0.5 rounded-lg transition-colors"
      >
        Long Rest (Restore)
      </button>
    </div>

    <!-- Active Slot Bubbles Grid -->
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as lvl}
        {@const slot = spellSlots[lvl] || { total: 0, used: 0 }}
        {#if slot.total > 0}
          <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 flex flex-col justify-between">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[10px] font-mono font-bold text-slate-300">Lvl {lvl}</span>
              <span class="text-[9px] font-mono {slot.used === slot.total ? 'text-rose-400' : 'text-cyan-400'}">
                {slot.total - slot.used}/{slot.total}
              </span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              {#each Array(slot.total) as _, idx}
                {@const isExpended = idx < slot.used}
                <button
                  type="button"
                  onclick={() => toggleSlot(lvl, idx)}
                  aria-label="Toggle spell slot level {lvl} bubble {idx + 1}"
                  class="w-5 h-5 rounded-full transition-all duration-200 flex items-center justify-center border {isExpended ? 'bg-slate-900 border-slate-700 text-slate-600' : 'bg-cyan-500 border-cyan-300 shadow-sm shadow-cyan-500/50 scale-105 text-slate-950'}"
                >
                  <span class="text-[8px] font-black">{isExpended ? '✕' : '●'}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- ── SPELLBOOK SEARCH & LEVEL FILTER ──────────────────────────────────── -->
  <div class="space-y-2">
    <div class="relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search prepared spells..."
        class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
      />
      <span class="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
    </div>

    <!-- Quick Level Filter Chips -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
      <button
        type="button"
        onclick={() => activeTabLevel = 'all'}
        class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all {activeTabLevel === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        All
      </button>
      <button
        type="button"
        onclick={() => activeTabLevel = 0}
        class="px-2 py-1 rounded-lg font-bold shrink-0 transition-all {activeTabLevel === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
      >
        Cantrip
      </button>
      {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as lvl}
        <button
          type="button"
          onclick={() => activeTabLevel = lvl}
          class="px-2 py-1 rounded-lg font-bold shrink-0 transition-all {activeTabLevel === lvl ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}"
        >
          Lvl {lvl}
        </button>
      {/each}
    </div>
  </div>

  <!-- ── PREPARED SPELLS LIST ─────────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto space-y-4 pr-0.5">
    {#if spellsByLevel.length === 0}
      <div class="text-center py-8 text-slate-500 text-xs">
        No spells found matching criteria.
      </div>
    {:else}
      {#each spellsByLevel as [lvl, list]}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400 px-1">
            <span>{lvl === 0 ? 'Cantrips' : `Level ${lvl} Spells`}</span>
            <span class="text-slate-600 font-mono text-[10px]">{list.length}</span>
          </div>

          <div class="space-y-1.5">
            {#each list as spell}
              <button
                type="button"
                onclick={() => selectedSpell = spell}
                class="w-full text-left bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 rounded-xl p-2.5 transition-all flex items-center justify-between group active:scale-[0.99]"
              >
                <div class="min-w-0 pr-2">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs text-slate-100 group-hover:text-indigo-300 truncate">
                      {spell.name}
                    </span>
                    {#if spell.concentration}
                      <span class="text-[9px] px-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">C</span>
                    {/if}
                    {#if spell.ritual}
                      <span class="text-[9px] px-1 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-mono">R</span>
                    {/if}
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{spell.school}</span>
                    <span>•</span>
                    <span>{spell.castingTime || spell.casting_time || '1 action'}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                    {spell.range}
                  </span>
                  <span class="text-slate-500 group-hover:text-slate-300">›</span>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- ── BOTTOM SHEET SPELL DETAILS & CASTING DRAWER ────────────────────────── -->
{#if selectedSpell}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center p-0 select-none animate-in fade-in duration-200"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    onclick={() => selectedSpell = null}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-md bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 shadow-2xl flex flex-col max-h-[80vh] text-slate-100 cursor-default animate-in slide-in-from-bottom duration-250 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Drag Handle Indicator -->
      <div class="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3"></div>

      <!-- Header -->
      <div class="flex items-start justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 class="text-base font-black text-white">{selectedSpell.name}</h3>
          <p class="text-xs text-indigo-400 font-medium">
            {selectedSpell.level === 0 ? 'Cantrip' : `Level ${selectedSpell.level}`} • {selectedSpell.school}
          </p>
        </div>
        <button
          type="button"
          onclick={() => selectedSpell = null}
          class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close spell sheet"
        >
          ✕
        </button>
      </div>

      <!-- Stat Badges -->
      <div class="grid grid-cols-3 gap-2 py-3 border-b border-slate-800 text-[11px]">
        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
          <span class="text-slate-500 block text-[9px] uppercase font-bold">Casting Time</span>
          <span class="font-bold text-slate-200">{selectedSpell.castingTime || selectedSpell.casting_time || '1 action'}</span>
        </div>
        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
          <span class="text-slate-500 block text-[9px] uppercase font-bold">Range</span>
          <span class="font-bold text-slate-200">{selectedSpell.range}</span>
        </div>
        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
          <span class="text-slate-500 block text-[9px] uppercase font-bold">Duration</span>
          <span class="font-bold text-slate-200 truncate">{selectedSpell.duration}</span>
        </div>
      </div>

      <!-- Components & Tags -->
      <div class="py-2.5 flex items-center justify-between text-xs border-b border-slate-800">
        <span class="text-slate-400 font-medium">Components: <strong class="text-slate-200">{selectedSpell.components}</strong></span>
        <div class="flex items-center gap-1">
          {#if selectedSpell.concentration}
            <span class="px-2 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-700/60 rounded text-[10px] font-bold">Concentration</span>
          {/if}
          {#if selectedSpell.ritual}
            <span class="px-2 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-700/60 rounded text-[10px] font-bold">Ritual</span>
          {/if}
        </div>
      </div>

      <!-- Description Body -->
      <div class="flex-1 overflow-y-auto py-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
        {selectedSpell.description}
      </div>

      <!-- Cast Button -->
      <div class="pt-3 border-t border-slate-800">
        <button
          type="button"
          onclick={() => handleCast(selectedSpell!)}
          class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all"
        >
          <span>✨</span>
          <span>Cast {selectedSpell.name}</span>
          {#if extractRollFormula(selectedSpell)}
            <span class="font-mono text-indigo-200 text-xs">({extractRollFormula(selectedSpell)})</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
