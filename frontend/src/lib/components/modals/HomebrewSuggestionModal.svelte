<script lang="ts">
  // HomebrewSuggestionModal.svelte
  // Svelte 5 Runes: Modal displaying detected homebrew rules from ingested documents with snippet previews

  import { rulesEngine } from '../../stores/rulesEngine.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import type { RuleDetectionResult } from '../../importers/ruleDetector';

  let {
    isOpen = $bindable(false),
    detectedRules = $bindable<RuleDetectionResult[]>([]),
    sourceFileName = 'Ingested Document'
  }: {
    isOpen: boolean;
    detectedRules: RuleDetectionResult[];
    sourceFileName?: string;
  } = $props();

  let selectedRuleIds = $state<string[]>([]);

  $effect(() => {
    if (isOpen && detectedRules.length > 0) {
      selectedRuleIds = detectedRules.map(r => r.ruleId);
    }
  });

  function toggleSelect(id: string) {
    if (selectedRuleIds.includes(id)) {
      selectedRuleIds = selectedRuleIds.filter(i => i !== id);
    } else {
      selectedRuleIds = [...selectedRuleIds, id];
    }
  }

  function handleEnableSelected() {
    for (const id of selectedRuleIds) {
      rulesEngine.enableModule(id, sourceFileName);
    }
    audioEngine.triggerSfx('sfx-secret');
    isOpen = false;
  }

  function handleIgnoreAll() {
    audioEngine.triggerSfx('sfx-rest');
    isOpen = false;
  }
</script>

{#if isOpen && detectedRules.length > 0}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="suggestion-modal-title"
    tabindex="-1"
    class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    onkeydown={(e) => { if (e.key === 'Escape') isOpen = false; }}
  >
    <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Modal Header -->
      <div class="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-lg">
            🔍
          </div>
          <div>
            <h3 id="suggestion-modal-title" class="text-sm font-black uppercase tracking-wider text-slate-100">
              Optional Rules Detected in Ingested Source
            </h3>
            <p class="text-[11px] text-slate-400">
              Found {detectedRules.length} modular rule systems in <strong class="text-slate-200">{sourceFileName}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Body: Detected Rules Checklist with Snippets -->
      <div class="p-6 overflow-y-auto space-y-4">
        <p class="text-xs text-slate-300 leading-relaxed">
          The following mechanics were detected in this document. By default, your workstation runs pure 5e SRD. You may opt in to activate any of these systems now or configure them later in Settings.
        </p>

        <div class="space-y-3">
          {#each detectedRules as rule (rule.ruleId)}
            {@const isChecked = selectedRuleIds.includes(rule.ruleId)}
            <div
              role="button"
              tabindex="0"
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSelect(rule.ruleId); }}
              onclick={() => toggleSelect(rule.ruleId)}
              class="p-4 rounded-xl border transition-all cursor-pointer text-left {isChecked ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-950/30' : 'bg-slate-950 border-slate-800 hover:border-slate-700 opacity-70'}"
            >
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    class="w-4 h-4 rounded text-indigo-600 focus:ring-0 focus:outline-none cursor-pointer bg-slate-900 border-slate-700"
                    onclick={(e) => e.stopPropagation()}
                    onchange={() => toggleSelect(rule.ruleId)}
                  />
                  <span class="text-xs font-bold text-slate-100">{rule.ruleName}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                    {rule.category}
                  </span>
                  <span class="text-[10px] font-bold text-amber-400 font-mono">
                    {rule.matchCount} match{rule.matchCount > 1 ? 'es' : ''}
                  </span>
                </div>
              </div>

              <!-- Snippet Preview -->
              <div class="mt-2 pl-6.5 text-[11px] font-mono text-slate-300 bg-slate-950/90 border border-slate-800/80 rounded-lg p-2 leading-snug">
                <span class="text-slate-500 italic block mb-0.5 text-[9px] uppercase font-sans">Matched Snippet:</span>
                "{rule.snippet}"
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0 gap-3">
        <button
          type="button"
          onclick={handleIgnoreAll}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
        >
          Keep Standard 5e SRD (Ignore All)
        </button>

        <button
          type="button"
          onclick={handleEnableSelected}
          class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5"
        >
          <span>✓</span>
          <span>Enable Selected Systems ({selectedRuleIds.length})</span>
        </button>
      </div>

    </div>
  </div>
{/if}
