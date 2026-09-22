<!-- src/lib/components/setup/CampaignFolderPicker.svelte -->
<!-- Local Campaign Directory Selection & Automatic Subfolder Scaffolding Component -->

<script lang="ts">
  import { campaignDirectoryStore } from '$lib/stores/campaignDirectoryStore.svelte';

  let {
    onSelect,
  }: {
    onSelect?: (path: string) => void;
  } = $props();

  async function handleBrowse() {
    const res = await campaignDirectoryStore.selectDirectory();
    if (res && onSelect) {
      onSelect(res.root_path);
    }
  }

  const subfolderMeta: Array<{
    id: 'maps' | 'audio' | 'compendiums' | 'tokens';
    icon: string;
    label: string;
    description: string;
  }> = [
    { id: 'maps', icon: '🗺️', label: 'maps/', description: 'DD2VTT, UVTT, SVG, PNG battlemaps' },
    { id: 'audio', icon: '🎵', label: 'audio/', description: 'OGG, MP3, WAV, FLAC ambient audio' },
    { id: 'compendiums', icon: '📖', label: 'compendiums/', description: 'JSON, Markdown, PDF rulesets' },
    { id: 'tokens', icon: '🛡️', label: 'tokens/', description: 'Custom NPC & PC token artwork' },
  ];
</script>

<div class="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
  <!-- Header & Description -->
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
        <span class="text-base">📁</span>
        Local Campaign Storage Directory
      </h3>
      <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">
        Select a folder on your machine. Assets are stored directly on your disk rather than in hidden browser databases.
      </p>
    </div>

    <button
      type="button"
      onclick={handleBrowse}
      disabled={campaignDirectoryStore.isLoading}
      class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 shrink-0"
    >
      <span>📂</span>
      <span>{campaignDirectoryStore.isLoading ? 'Selecting…' : 'Browse Folder'}</span>
    </button>
  </div>

  <!-- Path Display Bar -->
  <div class="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
    <span class="text-slate-500 font-mono text-[10px] shrink-0">PATH:</span>
    <span class="font-mono text-slate-200 truncate flex-1 select-all font-semibold">
      {campaignDirectoryStore.directoryPath || 'No folder selected yet'}
    </span>
    {#if campaignDirectoryStore.isConfigured}
      <span class="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-mono text-[9px] font-bold shrink-0">
        ✓ Scaffolded
      </span>
    {:else}
      <span class="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 font-mono text-[9px] font-bold shrink-0">
        Unconfigured
      </span>
    {/if}
  </div>

  <!-- Error Alert if any -->
  {#if campaignDirectoryStore.errorMessage}
    <div class="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
      <span>⚠️</span>
      <span>{campaignDirectoryStore.errorMessage}</span>
    </div>
  {/if}

  <!-- Automatic Subfolder Scaffolding Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
    {#each subfolderMeta as item}
      {@const stats = campaignDirectoryStore.dirInfo?.subfolders.find((s) => s.name === item.id)}
      <div class="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2.5 transition-colors hover:border-slate-700">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-lg shrink-0">{item.icon}</span>
          <div class="min-w-0">
            <span class="font-mono font-bold text-xs text-slate-200 block truncate">{item.label}</span>
            <span class="text-[10px] text-slate-500 block truncate">{item.description}</span>
          </div>
        </div>

        <div class="text-right shrink-0">
          <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px] font-bold">
            {stats?.file_count ?? 0} files
          </span>
        </div>
      </div>
    {/each}
  </div>
</div>
