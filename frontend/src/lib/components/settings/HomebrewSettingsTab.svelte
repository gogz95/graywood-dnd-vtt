<script lang="ts">
  // HomebrewSettingsTab.svelte
  // Svelte 5 Runes: Modular Homebrew Rules Submenu, Manifest Import/Export, and SRD Baseline

  import { rulesEngine, type RuleModule } from '../../stores/rulesEngine.svelte';
  import { audioEngine } from '../../audio/AudioEngine';

  let feedbackMessage = $state<string | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const modules = $derived(rulesEngine.modules);

  const CATEGORIES: Array<{ id: RuleModule['category']; label: string; icon: string }> = [
    { id: 'combat', label: 'Combat & Initiative', icon: '⚔️' },
    { id: 'equipment', label: 'Equipment & Durability', icon: '🛡️' },
    { id: 'roster', label: 'Party Roster & Storage', icon: '👥' },
    { id: 'calendar', label: 'Time & Calendars', icon: '⏳' },
  ];

  function handleToggle(id: string) {
    rulesEngine.toggleModule(id);
    audioEngine.triggerSfx('sfx-dice');
    const updated = rulesEngine.isEnabled(id);
    feedbackMessage = updated ? `Enabled module "${id}"` : `Disabled module "${id}" (Restored 5e SRD)`;
    setTimeout(() => { feedbackMessage = null; }, 2500);
  }

  function handleExportManifest() {
    try {
      const json = rulesEngine.exportManifest();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ruleset.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      audioEngine.triggerSfx('sfx-secret');
      feedbackMessage = 'Ruleset manifest exported as "ruleset.json"';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    } catch {
      feedbackMessage = 'Failed to export ruleset manifest.';
      setTimeout(() => { feedbackMessage = null; }, 2500);
    }
  }

  function handleImportClick() {
    fileInputEl?.click();
  }

  async function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = rulesEngine.importManifest(text);
      if (success) {
        audioEngine.triggerSfx('sfx-bell');
        feedbackMessage = `Imported ruleset manifest from "${file.name}"`;
      } else {
        feedbackMessage = 'Invalid ruleset manifest format.';
      }
    } catch {
      feedbackMessage = 'Error reading ruleset manifest file.';
    } finally {
      if (fileInputEl) fileInputEl.value = '';
      setTimeout(() => { feedbackMessage = null; }, 3000);
    }
  }

  function handleResetAll() {
    rulesEngine.resetToBaseline();
    audioEngine.triggerSfx('sfx-rest');
    feedbackMessage = 'All modules reset to Pure 5e SRD Baseline (OFF)';
    setTimeout(() => { feedbackMessage = null; }, 3000);
  }
</script>

<div class="space-y-6 animate-in fade-in duration-200">
  <!-- Top Bar: Overview & Manifest Controls -->
  <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4 flex-wrap">
    <div>
      <h3 class="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
        <span>⚙️</span>
        <span>Modular Rules Engine</span>
      </h3>
      <p class="text-[11px] text-slate-400 mt-0.5">
        Strict 5e SRD baseline enforced by default. Modular homebrew systems remain dormant until explicitly activated.
      </p>
    </div>

    <div class="flex items-center gap-2">
      {#if feedbackMessage}
        <span class="text-xs font-bold text-amber-400 animate-pulse">{feedbackMessage}</span>
      {/if}

      <button
        type="button"
        onclick={handleExportManifest}
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
        title="Export current rules configuration as ruleset.json"
      >
        <span>📥</span>
        <span>Export Ruleset</span>
      </button>

      <button
        type="button"
        onclick={handleImportClick}
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
        title="Import and validate ruleset.json manifest"
      >
        <span>📤</span>
        <span>Import Ruleset</span>
      </button>

      <input
        type="file"
        accept=".json"
        class="hidden"
        bind:this={fileInputEl}
        onchange={handleFileInput}
      />

      <button
        type="button"
        onclick={handleResetAll}
        class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
        title="Disable all homebrew and restore strict 5e SRD baseline"
      >
        <span>↺</span>
        <span>Reset to 5e SRD</span>
      </button>
    </div>
  </div>

  <!-- Modules Categorized Grid -->
  <div class="space-y-5">
    {#each CATEGORIES as cat}
      {@const catModules = modules.filter(m => m.category === cat.id)}
      {#if catModules.length > 0}
        <div class="space-y-2.5">
          <div class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </div>

          <div class="grid grid-cols-1 gap-2.5">
            {#each catModules as mod (mod.id)}
              <div class="p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 {mod.enabled ? 'bg-indigo-950/40 border-indigo-500/60 shadow-md shadow-indigo-950/20' : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'}">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-slate-100">{mod.name}</span>
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full {mod.enabled ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}">
                      {mod.enabled ? 'ACTIVE HOMEBREW' : 'OFF (5E SRD)'}
                    </span>
                    {#if mod.source}
                      <span class="text-[9px] text-slate-500 truncate">Source: {mod.source}</span>
                    {/if}
                  </div>
                  <p class="text-[11px] text-slate-400 mt-1 leading-snug">
                    {mod.description}
                  </p>
                </div>

                <!-- Custom Switch Toggle -->
                <button
                  type="button"
                  role="switch"
                  aria-checked={mod.enabled}
                  onclick={() => handleToggle(mod.id)}
                  class="w-12 h-6 rounded-full transition-colors relative shrink-0 p-0.5 cursor-pointer {mod.enabled ? 'bg-indigo-600' : 'bg-slate-800'}"
                  title={mod.enabled ? `Disable ${mod.name}` : `Enable ${mod.name}`}
                >
                  <span
                    class="block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 {mod.enabled ? 'translate-x-6' : 'translate-x-0'}"
                  ></span>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
