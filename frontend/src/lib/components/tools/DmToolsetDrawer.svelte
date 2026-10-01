<!-- src/lib/components/tools/DmToolsetDrawer.svelte -->
<!-- DM Quick-Tools Drawer: Markov Names, 5e NPC Statblocks & CR Loot Hoards -->

<script lang="ts">
  import { generateName, type CultureKey } from '$lib/services/generators/markovNameGen';
  import {
    generateNpc,
    actorToCompendiumMonster,
    persistNpcToCompendium,
    spawnNpcTokenOnCanvas,
  } from '$lib/services/generators/npcGenerator';
  import { generateLoot, type LootResult } from '$lib/services/generators/lootGenerator';
  import type { NpcArchetype, NpcCulture } from '$lib/types/actor';
  import type { ActorSchema } from '$lib/types/actor';

  let isOpen = $state(false);
  let activeTab = $state<'names' | 'npc' | 'loot'>('names');

  // ── Name Generator ──────────────────────────────────────────────────────────
  const CULTURES: { id: CultureKey; label: string }[] = [
    { id: 'common', label: 'Common (Human)' },
    { id: 'elven', label: 'Elven' },
    { id: 'dwarven', label: 'Dwarven' },
    { id: 'draconic', label: 'Draconic' },
    { id: 'orcish', label: 'Orcish' },
  ];
  let selectedCulture = $state<CultureKey>('common');
  let generatedName = $state<string | null>(null);

  function handleGenerateName() {
    generatedName = generateName(selectedCulture);
  }

  async function handleCopyName() {
    if (generatedName && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(generatedName);
    }
  }

  // ── NPC Generator ───────────────────────────────────────────────────────────
  const ARCHETYPES: NpcArchetype[] = ['Guard', 'Mage', 'Priest', 'Bandit', 'Noble'];
  const NPC_CULTURES: { id: NpcCulture; label: string }[] = [
    { id: 'human', label: 'Human' },
    { id: 'elven', label: 'Elf' },
    { id: 'dwarven', label: 'Dwarf' },
    { id: 'common', label: 'Common' },
    { id: 'draconic', label: 'Dragonborn' },
    { id: 'orcish', label: 'Orc / Half-Orc' },
  ];

  let npcArchetype = $state<NpcArchetype>('Guard');
  let npcCulture = $state<NpcCulture>('human');
  let npcCr = $state(1);
  let generatedNpc = $state<ActorSchema | null>(null);
  let isSavingNpc = $state(false);
  let npcSaveMsg = $state<string | null>(null);

  function handleGenerateNpc() {
    generatedNpc = generateNpc({ archetype: npcArchetype, culture: npcCulture, cr: npcCr });
    npcSaveMsg = null;
  }

  async function handleSaveNpcToCompendium() {
    if (!generatedNpc) return;
    isSavingNpc = true;
    npcSaveMsg = null;
    try {
      await persistNpcToCompendium(generatedNpc);
      npcSaveMsg = `✓ Saved "${generatedNpc.name}" to compendium`;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vtt:bestiary-updated'));
    } catch (e: any) {
      npcSaveMsg = `Error: ${e?.message ?? 'save failed'}`;
    } finally {
      isSavingNpc = false;
    }
  }

  function handleSpawnNpcToken() {
    if (!generatedNpc) return;
    spawnNpcTokenOnCanvas(generatedNpc);
  }

  // ── Loot Hoard ──────────────────────────────────────────────────────────────
  let lootCr = $state(5);
  let isHoard = $state(false);
  let lootResult = $state<LootResult | null>(null);

  function handleGenerateLoot() {
    lootResult = generateLoot({ cr: lootCr, isHoard });
  }
</script>

<div class="fixed top-4 right-4 z-40">
  <button
    type="button"
    onclick={() => (isOpen = !isOpen)}
    class="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl backdrop-blur shadow-lg transition-colors"
  >
    {isOpen ? '✕ Close Tools' : '⚙ DM Tools'}
  </button>

  {#if isOpen}
    <div class="absolute right-0 mt-2 w-80 bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col max-h-[80vh] overflow-hidden">
      <!-- Tab bar -->
      <div class="flex border-b border-slate-800">
        {#each [['names', '🔤 Names'], ['npc', '🧙 NPC'], ['loot', '💰 Loot']] as [id, label]}
          <button
            type="button"
            onclick={() => { activeTab = id as any; }}
            class="flex-1 py-2 text-[11px] font-bold transition-colors {activeTab === id ? 'text-indigo-300 border-b-2 border-indigo-500 bg-slate-900/40' : 'text-slate-500 hover:text-slate-300'}"
          >{label}</button>
        {/each}
      </div>

      <div class="p-4 space-y-3 text-xs overflow-y-auto flex-1">

        <!-- ── Name Tab ─────────────────────────────────────────────────────── -->
        {#if activeTab === 'names'}
          <h3 class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Markov Fantasy Name</h3>
          <div class="space-y-1">
            <label for="dm-culture-select" class="text-slate-400 text-[10px] font-semibold block">Culture</label>
            <select
              id="dm-culture-select"
              bind:value={selectedCulture}
              class="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 outline-none"
            >
              {#each CULTURES as c}
                <option value={c.id}>{c.label}</option>
              {/each}
            </select>
          </div>
          <button type="button" onclick={handleGenerateName}
            class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all">
            Generate Name
          </button>
          {#if generatedName}
            <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <span class="font-bold text-slate-100">{generatedName}</span>
              <button type="button" onclick={handleCopyName}
                class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold">Copy</button>
            </div>
          {/if}

        <!-- ── NPC Tab ─────────────────────────────────────────────────────── -->
        {:else if activeTab === 'npc'}
          <h3 class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">5e NPC Statblock</h3>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="npc-arch" class="text-[10px] text-slate-400 block mb-0.5">Archetype</label>
              <select id="npc-arch" bind:value={npcArchetype} class="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 outline-none text-[11px]">
                {#each ARCHETYPES as a}<option value={a}>{a}</option>{/each}
              </select>
            </div>
            <div>
              <label for="npc-culture" class="text-[10px] text-slate-400 block mb-0.5">Culture</label>
              <select id="npc-culture" bind:value={npcCulture} class="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 outline-none text-[11px]">
                {#each NPC_CULTURES as c}<option value={c.id}>{c.label}</option>{/each}
              </select>
            </div>
          </div>
          <div>
            <label for="npc-cr" class="text-[10px] text-slate-400 block mb-0.5">Challenge Rating: CR {npcCr}</label>
            <input id="npc-cr" type="range" min="0" max="20" step="1" bind:value={npcCr} class="w-full accent-indigo-500" />
          </div>
          <button type="button" onclick={handleGenerateNpc}
            class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all">
            Generate NPC
          </button>
          {#if generatedNpc}
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div class="font-bold text-slate-100 text-sm">{generatedNpc.name}</div>
              <div class="text-indigo-300 text-[10px] font-semibold">{generatedNpc.archetype} · {generatedNpc.culture} · CR {npcCr}</div>
              <div class="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                <span>AC {generatedNpc.ac}</span>
                <span>HP {generatedNpc.hp}</span>
                <span>Spd {generatedNpc.speed}</span>
              </div>
              {#if generatedNpc.personality?.trait}
                <p class="text-[10px] text-slate-400 italic">"{generatedNpc.personality.trait}"</p>
              {/if}
              {#if npcSaveMsg}
                <p class="text-[10px] {npcSaveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}">{npcSaveMsg}</p>
              {/if}
              <div class="grid grid-cols-2 gap-1.5 pt-1">
                <button type="button" onclick={handleSaveNpcToCompendium} disabled={isSavingNpc}
                  class="py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg text-[10px] transition-colors">
                  {isSavingNpc ? '⏳ Saving…' : '💾 Save to Compendium'}
                </button>
                <button type="button" onclick={handleSpawnNpcToken}
                  class="py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white font-semibold rounded-lg text-[10px] transition-colors">
                  🎭 Spawn Token
                </button>
              </div>
            </div>
          {/if}

        <!-- ── Loot Tab ────────────────────────────────────────────────────── -->
        {:else if activeTab === 'loot'}
          <h3 class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">CR-Scaled Loot Hoard</h3>
          <div>
            <label for="loot-cr" class="text-[10px] text-slate-400 block mb-0.5">CR: {lootCr}</label>
            <input id="loot-cr" type="range" min="0" max="24" step="1" bind:value={lootCr} class="w-full accent-amber-500" />
          </div>
          <label class="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input type="checkbox" bind:checked={isHoard} class="accent-amber-500" />
            <span class="text-[11px] font-semibold">Treasure Hoard (larger tables)</span>
          </label>
          <button type="button" onclick={handleGenerateLoot}
            class="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all">
            Roll Loot
          </button>
          {#if lootResult}
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <div class="text-amber-300 font-bold text-[11px]">CR {lootCr} {isHoard ? 'Hoard' : 'Individual'} · {lootResult.crBracket}</div>
              <div class="grid grid-cols-5 gap-1 text-[10px] text-slate-300">
                <span title="Copper">{lootResult.coins.cp}cp</span>
                <span title="Silver">{lootResult.coins.sp}sp</span>
                <span title="Electrum">{lootResult.coins.ep}ep</span>
                <span title="Gold" class="text-amber-400 font-bold">{lootResult.coins.gp}gp</span>
                <span title="Platinum">{lootResult.coins.pp}pp</span>
              </div>
              {#if lootResult.valuables.length > 0}
                <div class="space-y-0.5">
                  {#each lootResult.valuables as v}
                    <div class="text-[10px] text-slate-400">
                      {v.count}× {v.name} <span class="text-amber-400">({v.totalGp}gp)</span>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if lootResult.magicItems.length > 0}
                <div class="space-y-0.5">
                  {#each lootResult.magicItems as item}
                    <div class="text-[10px] text-indigo-300 font-semibold">✨ {item.name}</div>
                  {/each}
                </div>
              {/if}
              <div class="text-[11px] text-emerald-400 font-bold">≈ {lootResult.totalValueGp.toLocaleString()} gp total</div>
            </div>
          {/if}
        {/if}

      </div>
    </div>
  {/if}
</div>
