<script lang="ts">
  // EncounterDashboard.svelte — Combat tracker with Preparation/Active mode toggle and local encounter saves

  import { audioEngine } from '../../audio/AudioEngine';
  import type { ActiveCombatant, Encounter, MonsterStatBlock, CombatMode, SavedEncounter } from '../../../types/combat';

  const STORAGE_KEY = 'vtt_encounters';
  const CONDITIONS = ['Blinded','Charmed','Deafened','Frightened','Grappled',
    'Incapacitated','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];

  let { onSpawnMonster }: { onSpawnMonster?: (m: MonsterStatBlock, x: number, y: number) => void } = $props();

  // ── Encounter storage helpers ──────────────────────────────────────────────
  function loadAll(): Record<string, SavedEncounter> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, SavedEncounter>; } catch { return {}; }
  }
  function saveAll(data: Record<string, SavedEncounter>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function genId() { return `enc-${Date.now()}`; }
  function genCombId() { return `comb-${Date.now()}-${Math.random().toString(36).slice(2,5)}`; }

  // ── State ──────────────────────────────────────────────────────────────────
  let allEncounters = $state<Record<string, SavedEncounter>>(loadAll());
  let activeEncounterId = $state<string | null>(Object.keys(loadAll())[0] ?? null);
  let combatMode = $state<CombatMode>('preparation');

  let encounter = $derived<Encounter | null>(
    activeEncounterId ? (allEncounters[activeEncounterId]?.encounter ?? null) : null
  );
  let combatants = $derived<ActiveCombatant[]>(
    activeEncounterId ? (allEncounters[activeEncounterId]?.combatants ?? []) : []
  );

  function mutateCombatants(id: string, fn: (c: ActiveCombatant) => ActiveCombatant) {
    if (!activeEncounterId) return;
    allEncounters = {
      ...allEncounters,
      [activeEncounterId]: {
        encounter: allEncounters[activeEncounterId].encounter,
        combatants: allEncounters[activeEncounterId].combatants.map(c => c.id === id ? fn(c) : c),
      },
    };
    saveAll(allEncounters);
  }

  function mutateEncounter(fn: (e: Encounter) => Encounter) {
    if (!activeEncounterId) return;
    allEncounters = {
      ...allEncounters,
      [activeEncounterId]: {
        ...allEncounters[activeEncounterId],
        encounter: fn(allEncounters[activeEncounterId].encounter),
      },
    };
    saveAll(allEncounters);
  }

  // ── Encounter CRUD ─────────────────────────────────────────────────────────
  let newEncName = $state('');
  let showNewForm = $state(false);

  function createEncounter() {
    const name = newEncName.trim() || `Encounter ${Object.keys(allEncounters).length + 1}`;
    const id = genId();
    const enc: Encounter = { id, name, round: 1, current_turn_index: 0, is_active: false };
    allEncounters = { ...allEncounters, [id]: { encounter: enc, combatants: [] } };
    saveAll(allEncounters);
    activeEncounterId = id;
    combatMode = 'preparation';
    newEncName = '';
    showNewForm = false;
  }

  function deleteEncounter(id: string) {
    const copy = { ...allEncounters };
    delete copy[id];
    allEncounters = copy;
    saveAll(allEncounters);
    const keys = Object.keys(allEncounters);
    activeEncounterId = keys[0] ?? null;
  }

  // ── Initiative Management ──────────────────────────────────────────────────
  let sortedCombatants = $derived<ActiveCombatant[]>(
    [...combatants].sort((a, b) => b.initiative - a.initiative)
  );

  let newCombatantName = $state('');
  let newCombatantInit = $state(10);
  let newCombatantHp   = $state(20);
  let newCombatantAc   = $state(12);
  let newIsMonster     = $state(false);
  let showAddCombatant = $state(false);
  let showInitRoller   = $state(false);

  function addCombatant() {
    if (!activeEncounterId || !newCombatantName.trim()) return;
    const nc: ActiveCombatant = {
      id: genCombId(), encounter_id: activeEncounterId, token_id: '',
      name: newCombatantName.trim(), initiative: newCombatantInit,
      hp_current: newCombatantHp, hp_max: newCombatantHp, temp_hp: 0,
      ac: newCombatantAc, is_monster: newIsMonster,
      monster_compendium_id: null, multiattack_profile: null, conditions: [],
    };
    allEncounters = {
      ...allEncounters,
      [activeEncounterId]: { ...allEncounters[activeEncounterId], combatants: [...combatants, nc] },
    };
    saveAll(allEncounters);
    newCombatantName = ''; newCombatantInit = 10; newCombatantHp = 20; newCombatantAc = 12; newIsMonster = false;
    showAddCombatant = false;
  }

  function removeCombatant(id: string) {
    if (!activeEncounterId) return;
    allEncounters = {
      ...allEncounters,
      [activeEncounterId]: { ...allEncounters[activeEncounterId], combatants: combatants.filter(c => c.id !== id) },
    };
    saveAll(allEncounters);
  }

  function rollAllInitiatives() {
    if (!activeEncounterId) return;
    allEncounters = {
      ...allEncounters,
      [activeEncounterId]: {
        ...allEncounters[activeEncounterId],
        combatants: combatants.map(c => ({ ...c, initiative: Math.ceil(Math.random() * 20) })),
      },
    };
    saveAll(allEncounters);
  }

  // ── HP & Conditions ────────────────────────────────────────────────────────
  let hpDeltaInput = $state<Record<string, string>>({});

  function applyHpDelta(id: string) {
    const raw = hpDeltaInput[id] ?? '';
    const delta = parseInt(raw, 10);
    if (isNaN(delta)) return;
    mutateCombatants(id, c => ({ ...c, hp_current: Math.max(0, Math.min(c.hp_max + c.temp_hp, c.hp_current + delta)) }));
    if (delta < 0) audioEngine.triggerSfx('sfx-sword');
    hpDeltaInput = { ...hpDeltaInput, [id]: '' };
  }

  function toggleCondition(combId: string, cond: string) {
    mutateCombatants(combId, c => ({
      ...c,
      conditions: c.conditions.includes(cond) ? c.conditions.filter(x => x !== cond) : [...c.conditions, cond],
    }));
  }

  // ── Turn / Round ───────────────────────────────────────────────────────────
  function nextTurn() {
    if (!encounter) return;
    const len = sortedCombatants.length;
    if (len === 0) return;
    const nextIdx = (encounter.current_turn_index + 1) % len;
    const newRound = nextIdx === 0 ? encounter.round + 1 : encounter.round;
    mutateEncounter(e => ({ ...e, current_turn_index: nextIdx, round: newRound }));
    audioEngine.triggerSfx('sfx-bell');
  }

  function prevTurn() {
    if (!encounter) return;
    const len = sortedCombatants.length;
    if (len === 0) return;
    const prevIdx = (encounter.current_turn_index - 1 + len) % len;
    const newRound = prevIdx === len - 1 && encounter.round > 1 ? encounter.round - 1 : encounter.round;
    mutateEncounter(e => ({ ...e, current_turn_index: prevIdx, round: newRound }));
  }

  function startCombat() {
    if (!encounter) return;
    combatMode = 'active';
    mutateEncounter(e => ({ ...e, is_active: true, round: 1, current_turn_index: 0 }));
    audioEngine.triggerSfx('sfx-bell');
  }

  function endCombat() {
    combatMode = 'preparation';
    mutateEncounter(e => ({ ...e, is_active: false }));
  }

  // ── HP bar color ───────────────────────────────────────────────────────────
  function hpColor(c: ActiveCombatant) {
    const pct = c.hp_current / c.hp_max;
    if (pct <= 0)   return 'bg-slate-700';
    if (pct < 0.25) return 'bg-rose-600';
    if (pct < 0.5)  return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  function crLabel(cr: number) {
    if (cr === 0.125) return '⅛';
    if (cr === 0.25)  return '¼';
    if (cr === 0.5)   return '½';
    return String(cr);
  }

  let expandedCondId = $state<string | null>(null);
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">

  <!-- ── Top Bar ─────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 shrink-0 bg-slate-900 flex-wrap">

    <!-- Encounter Selector -->
    <select
      bind:value={activeEncounterId}
      onchange={() => { combatMode = 'preparation'; }}
      class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
    >
      {#if Object.keys(allEncounters).length === 0}
        <option value={null}>— No encounters —</option>
      {/if}
      {#each Object.values(allEncounters) as saved}
        <option value={saved.encounter.id}>{saved.encounter.name}</option>
      {/each}
    </select>

    <button onclick={() => showNewForm = !showNewForm} class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">+ New</button>

    {#if activeEncounterId}
      <button onclick={() => deleteEncounter(activeEncounterId!)} class="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/70 text-rose-400 text-xs font-semibold rounded-lg transition-colors">🗑</button>
    {/if}

    <!-- Mode toggle -->
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
      <button
        onclick={() => { combatMode = 'preparation'; if (encounter) mutateEncounter(e => ({ ...e, is_active: false })); }}
        class="px-2.5 py-1 rounded text-xs font-bold transition-colors {combatMode === 'preparation' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}"
      >⚙ Prep</button>
      <button
        onclick={startCombat}
        disabled={!activeEncounterId || sortedCombatants.length === 0}
        class="px-2.5 py-1 rounded text-xs font-bold transition-colors disabled:opacity-30 {combatMode === 'active' ? 'bg-rose-700 text-white shadow-sm shadow-rose-700/50' : 'text-slate-500 hover:text-slate-300'}"
      >⚔️ Active</button>
    </div>
  </div>

  <!-- New encounter form (inline) -->
  {#if showNewForm}
    <div class="flex gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950/60 shrink-0">
      <input type="text" bind:value={newEncName} placeholder="Encounter name…" class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
      <button onclick={createEncounter} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors">Create</button>
      <button onclick={() => showNewForm = false} class="px-2 py-1.5 bg-slate-800 text-slate-400 text-xs rounded-lg hover:bg-slate-700 transition-colors">✕</button>
    </div>
  {/if}

  {#if !activeEncounterId}
    <div class="flex-1 flex items-center justify-center text-center p-8 text-slate-600">
      <div>
        <p class="text-3xl mb-3">⚔️</p>
        <p class="text-sm font-semibold text-slate-400 mb-1">No encounter selected</p>
        <p class="text-xs">Create a new encounter above to begin staging combatants.</p>
      </div>
    </div>
  {:else}
    <!-- ── Active Combat Banner ──────────────────────────────────────────── -->
    {#if combatMode === 'active' && encounter}
      <div class="flex items-center justify-between px-4 py-2 bg-rose-950/30 border-b border-rose-800/30 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></div>
          <span class="text-xs font-bold text-rose-300 uppercase tracking-wider">Active Combat</span>
          <span class="text-xs font-mono text-slate-400">Round <span class="text-rose-300 font-bold">{encounter.round}</span></span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick={prevTurn} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors">◀ Prev</button>
          <button onclick={nextTurn} class="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded transition-colors shadow-sm shadow-rose-700/40">Next ▶</button>
          <button onclick={endCombat} class="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs rounded border border-slate-800 transition-colors">⏹ End</button>
        </div>
      </div>
    {/if}

    <!-- ── Preparation toolbar ─────────────────────────────────────────── -->
    {#if combatMode === 'preparation'}
      <div class="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/40 shrink-0 flex-wrap">
        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Staging</span>
        <button onclick={() => showAddCombatant = !showAddCombatant} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors">+ Add</button>
        <button onclick={rollAllInitiatives} disabled={combatants.length === 0} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40">🎲 Roll All Init</button>
        <div class="flex-1"></div>
        <button
          onclick={startCombat}
          disabled={combatants.length === 0}
          class="px-3 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-30 text-white text-xs font-bold rounded-lg shadow-sm shadow-rose-700/30 transition-colors"
        >⚔️ Begin Combat</button>
      </div>

      <!-- Add combatant inline form -->
      {#if showAddCombatant}
        <div class="px-4 py-3 border-b border-slate-800 bg-slate-900/60 shrink-0 grid grid-cols-5 gap-2 text-xs">
          <input type="text" bind:value={newCombatantName} placeholder="Name…" class="col-span-2 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500" />
          <div class="space-y-0.5">
            <span class="text-[9px] text-slate-600 uppercase">Init</span>
            <input type="number" bind:value={newCombatantInit} class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div class="space-y-0.5">
            <span class="text-[9px] text-slate-600 uppercase">HP</span>
            <input type="number" bind:value={newCombatantHp} class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div class="space-y-0.5">
            <span class="text-[9px] text-slate-600 uppercase">AC</span>
            <input type="number" bind:value={newCombatantAc} class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <label class="flex items-center gap-1.5 col-span-2 text-slate-400 cursor-pointer">
            <input type="checkbox" bind:checked={newIsMonster} class="rounded" /> Monster / NPC
          </label>
          <button onclick={addCombatant} disabled={!newCombatantName.trim()} class="col-span-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded transition-colors">Add</button>
          <button onclick={() => showAddCombatant = false} class="py-1.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 transition-colors">✕</button>
        </div>
      {/if}
    {/if}

    <!-- ── Combatant List ───────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      {#if sortedCombatants.length === 0}
        <div class="text-center py-12 text-slate-600 text-xs">No combatants staged. Add characters or monsters above.</div>
      {/if}

      {#each sortedCombatants as comb, idx (comb.id)}
        {@const isActive = combatMode === 'active' && encounter?.current_turn_index === idx}
        <div class="rounded-xl border transition-all overflow-hidden {isActive ? 'border-rose-500 bg-rose-950/20 shadow-md shadow-rose-700/10' : 'border-slate-800 bg-slate-900'}">
          <!-- Main row -->
          <div class="flex items-center gap-2 px-3 py-2.5">
            <!-- Initiative badge -->
            <div class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-black border
              {isActive ? 'bg-rose-700 text-white border-rose-600' : 'bg-slate-800 text-slate-300 border-slate-700'}"
            >{comb.initiative}</div>

            <!-- Name + type -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                {#if isActive}<div class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></div>{/if}
                <span class="text-sm font-bold truncate {comb.is_monster ? 'text-rose-300' : 'text-amber-300'}">{comb.name}</span>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[10px] font-mono text-slate-500">AC {comb.ac}</span>
                {#if comb.conditions.length > 0}
                  {#each comb.conditions as cond}
                    <span class="px-1 py-0.5 bg-amber-950/60 text-amber-400 text-[9px] font-semibold rounded border border-amber-800/30">{cond}</span>
                  {/each}
                {/if}
              </div>
            </div>

            <!-- HP display -->
            <div class="text-right shrink-0">
              <div class="text-sm font-mono font-bold {comb.hp_current <= 0 ? 'text-red-500' : comb.hp_current < comb.hp_max * 0.5 ? 'text-amber-400' : 'text-emerald-400'}">
                {comb.hp_current}<span class="text-slate-600 text-xs">/{comb.hp_max}</span>
              </div>
              <div class="w-20 h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                <div class="{hpColor(comb)} h-full rounded-full transition-all" style="width:{Math.max(0,Math.min(100,(comb.hp_current/comb.hp_max)*100))}%"></div>
              </div>
            </div>

            <!-- HP delta input -->
            <div class="flex items-center gap-1 shrink-0">
              <input
                type="number"
                placeholder="±HP"
                bind:value={hpDeltaInput[comb.id]}
                onkeydown={(e) => { if (e.key === 'Enter') applyHpDelta(comb.id); }}
                class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 text-center"
              />
              <button onclick={() => applyHpDelta(comb.id)} class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors font-bold">✓</button>
            </div>

            <!-- Expand / remove -->
            <button onclick={() => expandedCondId = expandedCondId === comb.id ? null : comb.id} class="p-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors" title="Conditions">{expandedCondId === comb.id ? '▲' : '▼'}</button>
            <button onclick={() => removeCombatant(comb.id)} class="p-1.5 text-slate-600 hover:text-rose-400 text-xs transition-colors" title="Remove">✕</button>
          </div>

          <!-- Condition picker (expandable) -->
          {#if expandedCondId === comb.id}
            <div class="px-3 pb-3 flex flex-wrap gap-1.5 border-t border-slate-800/60 pt-2">
              {#each CONDITIONS as cond}
                <button
                  onclick={() => toggleCondition(comb.id, cond)}
                  class="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors {comb.conditions.includes(cond) ? 'bg-amber-700/60 text-amber-200 border border-amber-600/40' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'}"
                >{cond}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
