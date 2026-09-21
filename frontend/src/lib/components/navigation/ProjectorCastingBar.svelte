<!-- src/lib/components/navigation/ProjectorCastingBar.svelte -->
<!-- DM Projector Casting Switchboard: Quick buttons [Battlemap], [World Atlas], [Blackout] & Toggles -->

<script lang="ts">
  import { projectorStore, type ProjectorCastSource } from '../../stores/projectorStore.svelte';

  const sources: Array<{ id: ProjectorCastSource; label: string; icon: string }> = [
    { id: 'battlemap', label: 'Battlemap', icon: '⚔️' },
    { id: 'atlas', label: 'World Atlas', icon: '🗺️' },
    { id: 'blackout', label: 'Blackout', icon: '🌑' },
  ];
</script>

<div class="flex items-center gap-2 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-xl text-xs select-none">
  <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1 hidden sm:inline">
    Projector:
  </span>

  <!-- Quick Source Switchers -->
  <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
    {#each sources as src}
      {@const isActive = projectorStore.castSource === src.id}
      <button
        type="button"
        onclick={() => projectorStore.setCastingSource(src.id)}
        class="flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold text-xs transition-all {isActive
          ? src.id === 'blackout'
            ? 'bg-rose-950/90 border border-rose-600/60 text-rose-300 shadow-sm'
            : 'bg-indigo-600 border border-indigo-400/50 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}"
        title="Switch projector stream to {src.label}"
      >
        <span>{src.icon}</span>
        <span>{src.label}</span>
      </button>
    {/each}
  </div>

  <!-- Player Settings Toggles -->
  <div class="h-4 w-[1px] bg-slate-800 mx-1"></div>

  <div class="flex items-center gap-3 text-[11px] text-slate-300">
    <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-100 transition-colors">
      <input
        type="checkbox"
        checked={projectorStore.playerSettings.showGrid}
        onchange={(e) =>
          projectorStore.updateSettings({
            showGrid: (e.target as HTMLInputElement).checked,
          })}
        class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
      />
      <span>Grid</span>
    </label>

    <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-100 transition-colors">
      <input
        type="checkbox"
        checked={projectorStore.playerSettings.showHealthBars}
        onchange={(e) =>
          projectorStore.updateSettings({
            showHealthBars: (e.target as HTMLInputElement).checked,
          })}
        class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
      />
      <span>HP Bars</span>
    </label>
  </div>
</div>
