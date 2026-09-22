<!-- src/lib/components/tools/DmToolsDrawer.svelte -->
<!-- DM Quick-Tools Drawer: Canonical D&D Name Generator to Token Spawner -->

<script lang="ts">
  import { generateCanonicalDndName, type DndCulture } from '$lib/services/nameGenerator/dndNameEngine';
  import { tokenStore } from '$lib/stores/tokenStore.svelte';

  let isOpen = $state(false);
  let selectedCulture = $state<DndCulture>('dwarf');
  let currentOutput = $state<{ name: string; tag: string } | null>(null);

  const cultures: { id: DndCulture; label: string }[] = [
    { id: 'dwarf', label: 'Dwarf (Clans)' },
    { id: 'elf', label: 'Elf (Tel’Quessir)' },
    { id: 'halfling', label: 'Halfling (Hin)' },
    { id: 'tiefling', label: 'Tiefling (Virtue)' },
    { id: 'orc', label: 'Orc / Half-Orc' },
    { id: 'dragonborn', label: 'Dragonborn' }
  ];

  function handleGenerate() {
    currentOutput = generateCanonicalDndName(selectedCulture);
  }

  function handleSpawnToken() {
    if (!currentOutput) return;

    const posX = typeof window !== 'undefined' ? window.innerWidth / 2 : 400;
    const posY = typeof window !== 'undefined' ? window.innerHeight / 2 : 300;

    tokenStore.addToken({
      id: `token_${Date.now()}`,
      name: currentOutput.name,
      x: posX,
      y: posY,
      hp: 10,
      maxHp: 10,
      size: 1,
      conditions: [],
      isRevealed: true,
      isGmOnly: false
    });
  }

  async function handleCopy() {
    if (currentOutput && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(currentOutput.name);
    }
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
    <div class="absolute right-0 mt-2 w-72 bg-slate-950/95 border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3 text-xs backdrop-blur-md">
      <h3 class="font-bold text-slate-200 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2">
        D&D Canonical Name Generator
      </h3>

      <div class="space-y-1">
        <label for="culture-select" class="text-slate-400 text-[10px] font-semibold block">Culture / Lineage</label>
        <select
          id="culture-select"
          bind:value={selectedCulture}
          class="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 outline-none"
        >
          {#each cultures as c}
            <option value={c.id}>{c.label}</option>
          {/each}
        </select>
      </div>

      <button
        type="button"
        onclick={handleGenerate}
        class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
      >
        Generate Name
      </button>

      {#if currentOutput}
        <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div class="font-bold text-slate-100 text-sm">{currentOutput.name}</div>
          <div class="text-[10px] text-indigo-400 font-semibold">{currentOutput.tag}</div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={handleCopy}
            class="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-[10px]"
          >
            Copy Name
          </button>
          <button
            type="button"
            onclick={handleSpawnToken}
            class="py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-[10px]"
          >
            Spawn Token
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
