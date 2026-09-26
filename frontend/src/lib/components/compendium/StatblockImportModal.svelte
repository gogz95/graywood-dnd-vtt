<!-- StatblockImportModal.svelte — 5e Statblock Text Scraper & Compendium Import -->
<!-- Split-pane: paste area + live parsed preview with field validation highlighting -->

<script lang="ts">
  import { parseStatblock, parsedToMonster, type ParsedStatblock, type ParsedAction } from '../../services/statblockParser';
  import { compendiumDb } from '../../db/compendiumDb';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
    onSaved?: (name: string) => void;
  }

  let { isOpen = $bindable(false), onClose = () => { isOpen = false; }, onSaved }: Props = $props();

  let rawText = $state('');
  let parsed = $state<ParsedStatblock | null>(null);
  let isSaving = $state(false);
  let toastMsg = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSection = $state<'traits' | 'actions' | 'bonus' | 'reactions' | 'legendary'>('actions');

  function showToast(msg: string, duration = 3000) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMsg = null; }, duration);
  }

  function analyze() {
    if (!rawText.trim()) return;
    parsed = parseStatblock(rawText);
  }

  async function saveToCompendium() {
    if (!parsed) return;
    isSaving = true;
    try {
      const monster = parsedToMonster(parsed);
      await compendiumDb.monsters.put(monster);
      showToast(`✅ "${monster.name}" saved to Compendium`);
      onSaved?.(monster.name);
    } catch (err) {
      console.error('Failed to save statblock:', err);
      showToast('❌ Save failed — check console');
    } finally {
      isSaving = false;
    }
  }

  function clearAll() {
    rawText = '';
    parsed = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  // CR display helper
  function formatCr(cr: number): string {
    if (cr === 0.125) return '1/8';
    if (cr === 0.25)  return '1/4';
    if (cr === 0.5)   return '1/2';
    return String(cr);
  }

  function modStr(score: number): string {
    const mod = Math.floor((score - 10) / 2);
    return `${mod >= 0 ? '+' : ''}${mod}`;
  }

  function isMissing(field: string): boolean {
    return parsed?.missing?.includes(field) ?? false;
  }

  const SAMPLE_TEXT = `Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (-1) 14 (+2) 10 (+0) 10 (+0) 8 (-1) 8 (-1)
Skills Stealth +6
Senses Darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
ACTIONS
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

  const ABILITY_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  const SECTION_TABS: Array<{ key: typeof activeSection; label: string; field: keyof ParsedStatblock }> = [
    { key: 'traits',    label: 'Traits',          field: 'traits' },
    { key: 'actions',   label: 'Actions',          field: 'actions' },
    { key: 'bonus',     label: 'Bonus Actions',    field: 'bonusActions' },
    { key: 'reactions', label: 'Reactions',        field: 'reactions' },
    { key: 'legendary', label: 'Legendary',        field: 'legendaryActions' },
  ];

  function getSection(p: ParsedStatblock): ParsedAction[] {
    const map: Record<string, ParsedAction[]> = {
      traits: p.traits, actions: p.actions, bonus: p.bonusActions,
      reactions: p.reactions, legendary: p.legendaryActions,
    };
    return map[activeSection] ?? [];
  }

  function accentClass(bad: boolean) {
    return bad ? 'text-amber-400 border-amber-500/60 bg-amber-950/40' : 'text-slate-200 border-slate-700/60 bg-slate-950/40';
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    role="presentation"
    onkeydown={handleKeydown}
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div
      class="w-full max-w-6xl h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      role="dialog"
      aria-label="Statblock Importer"
    >
      <!-- ── Header bar ─────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-base">📋</div>
          <div>
            <h2 class="text-sm font-black text-slate-100 tracking-wide">Statblock Importer</h2>
            <p class="text-[10px] text-slate-500 font-medium">Paste raw PDF / web text to auto-parse a 5e monster</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if parsed}
            <button
              type="button"
              id="statblock-save-btn"
              onclick={saveToCompendium}
              disabled={isSaving}
              class="px-3.5 py-1.5 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg"
            >
              {isSaving ? 'Saving…' : '💾 Save to Compendium'}
            </button>
          {/if}
          <button
            type="button"
            onclick={clearAll}
            class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-xl transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onclick={onClose}
            class="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors text-sm"
            aria-label="Close"
          >✕</button>
        </div>
      </div>

      <!-- ── Split Pane Body ─────────────────────────────────────────────────── -->
      <div class="flex flex-1 min-h-0">

        <!-- ────────────────── LEFT: Input Pane ────────────────── -->
        <div class="w-[42%] flex flex-col border-r border-slate-800 min-h-0">
          <div class="flex items-center justify-between px-4 py-2 border-b border-slate-800/70 shrink-0">
            <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Raw Statblock Text</span>
            <button
              type="button"
              onclick={() => { rawText = SAMPLE_TEXT; }}
              class="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
            >
              Load Sample
            </button>
          </div>

          <textarea
            id="statblock-raw-input"
            bind:value={rawText}
            placeholder="Paste raw statblock text here…&#10;&#10;Supports SRD PDFs, D&D Beyond copy-paste, and most formatted statblock layouts."
            class="flex-1 bg-slate-950/60 text-slate-200 text-xs font-mono p-4 resize-none focus:outline-none placeholder-slate-600 leading-relaxed"
            spellcheck="false"
          ></textarea>

          <div class="px-4 py-3 border-t border-slate-800 shrink-0 flex items-center gap-2">
            <button
              type="button"
              id="statblock-analyze-btn"
              onclick={analyze}
              disabled={!rawText.trim()}
              class="flex-1 py-2 bg-gradient-to-r from-indigo-700 to-violet-700 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <span>🔍</span>
              <span>Analyze Text</span>
            </button>
          </div>
        </div>

        <!-- ────────────────── RIGHT: Preview Pane ────────────────── -->
        <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
          {#if !parsed}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600">
              <span class="text-5xl">🐉</span>
              <p class="text-sm font-semibold">Paste a statblock and click <span class="text-indigo-400">Analyze Text</span></p>
              <p class="text-xs text-slate-700 max-w-xs text-center">Supports SRD-layout, PDF rips, D&D Beyond, and most 5e formatted statblocks</p>
            </div>
          {:else}
            <!-- Parsed preview card -->
            <div class="flex-1 overflow-y-auto p-4 space-y-3">

              <!-- Missing fields warning -->
              {#if parsed.missing.length > 0}
                <div class="px-3 py-2 bg-amber-950/60 border border-amber-600/50 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                  <span class="text-base shrink-0">⚠️</span>
                  <div>
                    <span class="font-bold">Missing or unparsed fields: </span>
                    {parsed.missing.join(', ')}
                    <span class="text-amber-500 block mt-0.5 text-[10px]">Highlighted in amber below — edit the source text and re-analyze.</span>
                  </div>
                </div>
              {/if}

              <!-- Header card -->
              <div class="bg-slate-950/60 border border-slate-700/60 rounded-2xl p-4">
                <h3 class="text-lg font-black text-slate-100 {!parsed.name ? 'text-amber-400' : ''}">
                  {parsed.name || '⚠ Unknown Name'}
                </h3>
                <p class="text-xs text-slate-400 italic mt-0.5 {isMissing('size / type / alignment') ? 'text-amber-400' : ''}">
                  {parsed.size || '?'} {parsed.type || '?'}{parsed.alignment ? `, ${parsed.alignment}` : ''}
                </p>

                <!-- AC / HP / Speed row -->
                <div class="grid grid-cols-3 gap-2 mt-3">
                  <div class="bg-slate-900 rounded-xl p-2.5 border {isMissing('armor class') ? 'border-amber-500/60 bg-amber-950/30' : 'border-slate-800'}">
                    <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Armor Class</div>
                    <div class="text-sm font-black {isMissing('armor class') ? 'text-amber-400' : 'text-slate-100'}">
                      {parsed.ac || '—'}
                      {#if parsed.acNote}<span class="text-[10px] text-slate-400 font-normal"> ({parsed.acNote})</span>{/if}
                    </div>
                  </div>
                  <div class="bg-slate-900 rounded-xl p-2.5 border {isMissing('hit points') ? 'border-amber-500/60 bg-amber-950/30' : 'border-slate-800'}">
                    <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Hit Points</div>
                    <div class="text-sm font-black {isMissing('hit points') ? 'text-amber-400' : 'text-slate-100'}">
                      {parsed.hp || '—'}
                      {#if parsed.hitDice}<span class="text-[10px] text-slate-400 font-normal"> ({parsed.hitDice})</span>{/if}
                    </div>
                  </div>
                  <div class="bg-slate-900 rounded-xl p-2.5 border {isMissing('speed') ? 'border-amber-500/60 bg-amber-950/30' : 'border-slate-800'}">
                    <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Speed</div>
                    <div class="text-[11px] font-semibold {isMissing('speed') ? 'text-amber-400' : 'text-slate-200'} leading-tight">
                      {Object.entries(parsed.speed).map(([k,v]) => k === 'walk' ? v : `${k} ${v}`).join(', ') || '—'}
                    </div>
                  </div>
                </div>

                <!-- CR / Prof Bonus -->
                <div class="flex items-center gap-3 mt-2">
                  <span class="px-2 py-0.5 rounded-lg border text-[10px] font-bold {isMissing('challenge rating') ? 'bg-amber-950/50 border-amber-600/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-300'}">
                    CR {formatCr(parsed.cr)}
                  </span>
                  <span class="text-[10px] text-slate-500">Prof. Bonus +{parsed.proficiencyBonus}</span>
                </div>
              </div>

              <!-- Ability Scores -->
              <div class="bg-slate-950/60 border {isMissing('ability scores') ? 'border-amber-500/60' : 'border-slate-700/60'} rounded-2xl p-3">
                <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-2">Ability Scores</div>
                <div class="grid grid-cols-6 gap-1.5">
                  {#each ABILITY_KEYS as key, i}
                    {@const score = parsed[key] as number}
                    <div class="flex flex-col items-center bg-slate-900 rounded-xl py-2 border border-slate-800">
                      <span class="text-[9px] font-bold text-slate-500">{ABILITY_LABELS[i]}</span>
                      <span class="text-sm font-black text-slate-100 mt-0.5">{score}</span>
                      <span class="text-[10px] text-indigo-400 font-bold">{modStr(score)}</span>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Proficiency details row -->
              {#if Object.keys(parsed.savingThrows).length > 0 || Object.keys(parsed.skills).length > 0}
                <div class="grid grid-cols-2 gap-2">
                  {#if Object.keys(parsed.savingThrows).length > 0}
                    <div class="bg-slate-950/60 border border-slate-700/60 rounded-2xl p-3">
                      <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-2">Saving Throws</div>
                      <div class="flex flex-wrap gap-1.5">
                        {#each Object.entries(parsed.savingThrows) as [k, v]}
                          <span class="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-indigo-300">
                            {k} {v >= 0 ? '+' : ''}{v}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if Object.keys(parsed.skills).length > 0}
                    <div class="bg-slate-950/60 border border-slate-700/60 rounded-2xl p-3">
                      <div class="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-2">Skills</div>
                      <div class="flex flex-wrap gap-1.5">
                        {#each Object.entries(parsed.skills) as [k, v]}
                          <span class="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-emerald-300">
                            {k} {v >= 0 ? '+' : ''}{v}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Damage / Condition rows -->
              {#if parsed.damageResistances.length || parsed.damageImmunities.length || parsed.conditionImmunities.length || parsed.damageVulnerabilities.length}
                <div class="bg-slate-950/60 border border-slate-700/60 rounded-2xl p-3 space-y-2 text-[10px]">
                  {#if parsed.damageVulnerabilities.length}
                    <div><span class="font-bold text-rose-400">Vulnerabilities: </span><span class="text-slate-300">{parsed.damageVulnerabilities.join(', ')}</span></div>
                  {/if}
                  {#if parsed.damageResistances.length}
                    <div><span class="font-bold text-amber-400">Resistances: </span><span class="text-slate-300">{parsed.damageResistances.join(', ')}</span></div>
                  {/if}
                  {#if parsed.damageImmunities.length}
                    <div><span class="font-bold text-cyan-400">Immunities: </span><span class="text-slate-300">{parsed.damageImmunities.join(', ')}</span></div>
                  {/if}
                  {#if parsed.conditionImmunities.length}
                    <div><span class="font-bold text-purple-400">Condition Immunities: </span><span class="text-slate-300">{parsed.conditionImmunities.join(', ')}</span></div>
                  {/if}
                </div>
              {/if}

              <!-- Senses / Languages -->
              <div class="grid grid-cols-2 gap-2 text-[10px]">
                <div class="bg-slate-950/60 border {isMissing('senses') ? 'border-amber-500/60' : 'border-slate-700/60'} rounded-xl p-2.5">
                  <span class="font-bold text-slate-500 uppercase text-[9px] tracking-wider">Senses </span>
                  <span class="{isMissing('senses') ? 'text-amber-400' : 'text-slate-300'}">{parsed.senses || '—'}</span>
                </div>
                <div class="bg-slate-950/60 border {isMissing('languages') ? 'border-amber-500/60' : 'border-slate-700/60'} rounded-xl p-2.5">
                  <span class="font-bold text-slate-500 uppercase text-[9px] tracking-wider">Languages </span>
                  <span class="{isMissing('languages') ? 'text-amber-400' : 'text-slate-300'}">{parsed.languages || '—'}</span>
                </div>
              </div>

              <!-- Actions / Traits tabbed section -->
              <div class="bg-slate-950/60 border border-slate-700/60 rounded-2xl overflow-hidden">
                <!-- Tab bar -->
                <div class="flex border-b border-slate-800 overflow-x-auto">
                  {#each SECTION_TABS as tab}
                    {@const items = parsed[tab.field] as ParsedAction[]}
                    {#if items.length > 0}
                      <button
                        type="button"
                        onclick={() => activeSection = tab.key}
                        class="px-3 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors shrink-0
                          {activeSection === tab.key
                            ? 'bg-indigo-900/50 text-indigo-300 border-b-2 border-indigo-500'
                            : 'text-slate-500 hover:text-slate-300'}"
                      >
                        {tab.label} <span class="text-[9px] opacity-70">({items.length})</span>
                      </button>
                    {/if}
                  {/each}
                </div>

                <!-- Entries -->
                <div class="p-3 space-y-2 max-h-64 overflow-y-auto">
                  {#each getSection(parsed) as entry}
                    <div class="bg-slate-900 rounded-xl p-3 border border-slate-800">
                      <div class="flex items-start justify-between gap-2">
                        <span class="text-xs font-black text-slate-100">{entry.name}</span>
                        <div class="flex items-center gap-1 shrink-0">
                          {#if entry.attackType}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold {entry.attackType === 'melee' ? 'bg-rose-950 text-rose-300 border border-rose-700/60' : 'bg-sky-950 text-sky-300 border border-sky-700/60'}">
                              {entry.attackType}
                            </span>
                          {/if}
                          {#if entry.attackBonus !== undefined}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 border border-slate-700 text-indigo-300">
                              {entry.attackBonus >= 0 ? '+' : ''}{entry.attackBonus} to hit
                            </span>
                          {/if}
                          {#if entry.damageFormula}
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-950/60 border border-rose-700/50 text-rose-300">
                              {entry.damageFormula}
                            </span>
                          {/if}
                        </div>
                      </div>
                      {#if entry.description}
                        <p class="text-[10px] text-slate-400 mt-1.5 leading-relaxed">{entry.description}</p>
                      {/if}
                    </div>
                  {:else}
                    <p class="text-[10px] text-slate-600 text-center py-4">No entries parsed for this section</p>
                  {/each}
                </div>
              </div>

            </div>
          {/if}
        </div>
      </div>

      <!-- Toast -->
      {#if toastMsg}
        <div class="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-900/95 border border-indigo-500/60 text-indigo-200 text-xs font-medium rounded-2xl shadow-2xl backdrop-blur-md pointer-events-none flex items-center gap-2">
          {toastMsg}
        </div>
      {/if}
    </div>
  </div>
{/if}
