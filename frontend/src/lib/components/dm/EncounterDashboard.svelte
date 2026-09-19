<script lang="ts">
  import { onMount } from 'svelte';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import { exportCampaignArchive, spawnCombatantToken } from '../../ipc/tauriBridge';
  import Icons from '../../../components/Icons.svelte';

  export interface ActiveCombatant {
    id: string;
    encounter_id: string;
    token_id: string;
    name: string;
    initiative: number;
    hp_current: number;
    hp_max: number;
    temp_hp: number;
    ac: number;
    is_monster: boolean;
    monster_compendium_id: string | null;
    multiattack_profile: string | null;
    conditions: string[];
  }

  export interface Encounter {
    id: string;
    name: string;
    round: number;
    current_turn_index: number;
    is_active: boolean;
  }

  export interface MonsterStatBlock {
    id: string;
    name: string;
    size: string;
    creature_type: string;
    alignment: string;
    ac: number;
    hp_max: number;
    hit_dice: string;
    speed: number;
    challenge_rating: number;
    multiattack_profile: string;
    actions_json: string;
    traits_json: string;
  }

  let {
    onSpawnMonster,
  }: {
    onSpawnMonster?: (monster: MonsterStatBlock, x: number, y: number) => void;
  } = $props();

  let encounter: Encounter | null = $state(null);
  let combatants: ActiveCombatant[] = $state([]);
  let monsters: MonsterStatBlock[] = $state([]);
  let monsterSearch = $state('');
  let selectedCrFilter = $state<string>('all');
  let isLoading = $state(true);

  // Campaign Backup state
  let backupPath = $state('campaign_backup.aleamos');
  let isExportingArchive = $state(false);
  let backupFeedback: { message: string; isError: boolean } | null = $state(null);

  // Available standard 5e condition tags
  const ALL_CONDITIONS = [
    'Blinded',
    'Charmed',
    'Deafened',
    'Frightened',
    'Grappled',
    'Incapacitated',
    'Paralyzed',
    'Petrified',
    'Poisoned',
    'Prone',
    'Restrained',
    'Stunned',
    'Unconscious',
  ];

  onMount(async () => {
    await Promise.all([loadActiveEncounter(), loadMonsters()]);
    isLoading = false;
  });

  async function loadActiveEncounter() {
    try {
      const res = await fetch('/api/encounter/active');
      if (res.ok) {
        const data = await res.json();
        encounter = data.encounter;
        combatants = data.combatants;
      }
    } catch (err) {
      console.error('Failed to load active encounter:', err);
    }
  }

  async function loadMonsters() {
    try {
      const res = await fetch('/api/encounter/monsters');
      if (res.ok) {
        const data = await res.json();
        monsters = data.monsters;
      }
    } catch (err) {
      console.error('Failed to load compendium monsters:', err);
    }
  }

  async function handleNextTurn() {
    if (!encounter) return;
    try {
      const res = await fetch('/api/encounter/next_turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounter_id: encounter.id }),
      });
      if (res.ok) {
        const data = await res.json();
        encounter = data.encounter;
        combatants = data.combatants;
        dispatchSoundEvent('turn_bell');
      }
    } catch (err) {
      console.error('Next turn error:', err);
    }
  }

  async function handlePrevTurn() {
    if (!encounter) return;
    try {
      const res = await fetch('/api/encounter/prev_turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounter_id: encounter.id }),
      });
      if (res.ok) {
        const data = await res.json();
        encounter = data.encounter;
        combatants = data.combatants;
        dispatchSoundEvent('turn_bell');
      }
    } catch (err) {
      console.error('Prev turn error:', err);
    }
  }

  async function handleHpDelta(combatantId: string, delta: number) {
    try {
      const res = await fetch('/api/encounter/adjust_hp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combatant_id: combatantId, delta_hp: delta }),
      });
      if (res.ok) {
        const data = await res.json();
        combatants = combatants.map((c) =>
          c.id === combatantId ? data.combatant : c
        );
        if (delta < 0) {
          dispatchSoundEvent('critical_hit');
        } else {
          dispatchSoundEvent('potion');
        }
      }
    } catch (err) {
      console.error('Adjust HP error:', err);
    }
  }

  async function handleToggleCondition(combatantId: string, condition: string) {
    try {
      const res = await fetch('/api/encounter/toggle_condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combatant_id: combatantId, condition }),
      });
      if (res.ok) {
        const data = await res.json();
        combatants = combatants.map((c) =>
          c.id === combatantId ? data.combatant : c
        );
      }
    } catch (err) {
      console.error('Toggle condition error:', err);
    }
  }

  async function spawnMonsterOntoCanvas(monster: MonsterStatBlock, explicitX?: number, explicitY?: number) {
    const encId = encounter ? encounter.id : 'encounter-001';
    const canvasX = explicitX ?? (450 + (Math.random() * 120 - 60));
    const canvasY = explicitY ?? (300 + (Math.random() * 120 - 60));

    try {
      await spawnCombatantToken({
        encounter_id: encId,
        monster_compendium_id: monster.id,
        custom_name: monster.name,
        canvas_x: canvasX,
        canvas_y: canvasY,
      });

      await loadActiveEncounter();
      dispatchSoundEvent('fireball');
      if (onSpawnMonster) {
        onSpawnMonster(monster, canvasX, canvasY);
      }
    } catch (err) {
      console.error('Spawn monster error:', err);
    }
  }

  function handleMonsterDragStart(e: DragEvent, monster: MonsterStatBlock) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('application/json', JSON.stringify(monster));
    e.dataTransfer.setData('text/plain', monster.name);
    e.dataTransfer.effectAllowed = 'copy';
  }

  async function handleExportArchive() {
    isExportingArchive = true;
    backupFeedback = null;
    try {
      const res = await exportCampaignArchive(backupPath.trim() || 'campaign_backup.aleamos');
      backupFeedback = {
        message: `Backup archive saved: ${res.archive_path}`,
        isError: false,
      };
      dispatchSoundEvent('coin_clink');
    } catch (err) {
      backupFeedback = {
        message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    } finally {
      isExportingArchive = false;
    }
  }

  let filteredMonsters = $derived(
    monsters.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(monsterSearch.toLowerCase()) ||
        m.creature_type.toLowerCase().includes(monsterSearch.toLowerCase());
      const matchesCr =
        selectedCrFilter === 'all' ||
        (selectedCrFilter === 'low' && m.challenge_rating <= 2) ||
        (selectedCrFilter === 'mid' && m.challenge_rating > 2 && m.challenge_rating <= 8) ||
        (selectedCrFilter === 'high' && m.challenge_rating > 8);
      return matchesSearch && matchesCr;
    })
  );
</script>

<div class="space-y-6">
  <!-- Top DM Encounter Control Bar -->
  <div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl">
    <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <span class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
          <h2 class="text-base font-black text-slate-100 uppercase tracking-tight font-serif">
            DM Master Control: {encounter ? encounter.name : 'Battle for the Arch'}
          </h2>
          <span class="px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/50 text-red-300 text-[10px] font-bold uppercase tracking-wider">
            Active Encounter
          </span>
        </div>
        <p class="text-xs text-amber-200/60 mt-1">
          Combat Round <span class="font-mono text-amber-400 font-bold">{encounter ? encounter.round : 1}</span> &bull;
          Active Turn: <span class="font-bold text-slate-200 font-serif">{combatants[encounter?.current_turn_index ?? 0]?.name ?? 'None'}</span> &bull;
          <span class="font-mono text-slate-400">{combatants.length} Combatants Engaged</span>
        </p>
      </div>

      <!-- Turn Stepper Controls -->
      <div class="flex items-center gap-2 self-stretch sm:self-auto">
        <button
          onclick={handlePrevTurn}
          class="flex-1 sm:flex-none px-3.5 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-bold text-slate-200 transition-colors flex items-center justify-center gap-1.5"
        >
          <Icons name="chevron-left" size={14} />
          <span>Prev Turn</span>
        </button>
        <button
          onclick={handleNextTurn}
          class="flex-1 sm:flex-none px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:from-amber-600 active:to-amber-500 text-black rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5"
        >
          <span>Next Turn</span>
          <Icons name="chevron-right" size={14} />
        </button>
      </div>
    </div>
  </div>

  <!-- Two-Column Desktop Grid Layout: Left Side = Initiative & Controls, Right Side = Bestiary Spawner -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- LEFT SIDE (7 Cols): Initiative order list, active turn highlights, next/prev controls, monster HP adjustment inputs -->
    <div class="lg:col-span-7 space-y-4">
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <Icons name="sword" size={16} class="text-amber-400" />
          <h3 class="text-xs font-black text-slate-200 uppercase tracking-wider font-serif">
            Initiative Order & Combatant Vitality
          </h3>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">Sorted by Initiative (High &rarr; Low)</span>
      </div>

      {#if combatants.length === 0}
        <div class="bg-dark-900/60 border border-dashed border-dark-700 rounded-2xl p-8 text-center text-slate-400 text-xs">
          <Icons name="shield" size={32} class="mx-auto mb-2 text-slate-500 opacity-50" />
          <p class="font-bold text-slate-300">No combatants active in this encounter.</p>
          <p class="text-[11px] text-slate-500 mt-1">Drag or spawn a monster from the Bestiary on the right to begin.</p>
        </div>
      {/if}

      <!-- Combatants Initiative Order List -->
      <div class="space-y-3">
        {#each combatants as combatant, idx}
          {@const isActiveTurn = encounter !== null && idx === encounter.current_turn_index}
          {@const hpPercent = Math.max(0, Math.min(100, Math.round((combatant.hp_current / combatant.hp_max) * 100)))}

          <div
            class="rounded-2xl p-4 transition-all duration-200 border {
              isActiveTurn
                ? 'border-amber-500 bg-dark-900 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/50'
                : 'border-dark-700/80 bg-dark-900/70'
            }"
          >
            <!-- Header: Initiative, Name, AC, Active Tag -->
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-3">
                <!-- Initiative Badge -->
                <div class="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-sm {
                  isActiveTurn
                    ? 'bg-amber-500 text-black'
                    : 'bg-dark-800 border border-dark-600 text-slate-300'
                }">
                  {combatant.initiative}
                </div>

                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-bold text-sm text-slate-100 font-serif">
                      {combatant.name}
                    </h4>
                    {#if combatant.is_monster}
                      <span class="px-1.5 py-0.5 rounded bg-red-950/80 border border-red-500/40 text-red-300 text-[10px] font-bold uppercase">
                        Monster
                      </span>
                    {:else}
                      <span class="px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-500/40 text-blue-300 text-[10px] font-bold uppercase">
                        Player
                      </span>
                    {/if}
                    {#if isActiveTurn}
                      <span class="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500 text-amber-300 text-[10px] font-bold animate-pulse">
                        CURRENT TURN
                      </span>
                    {/if}
                  </div>
                  {#if combatant.multiattack_profile}
                    <p class="text-[11px] text-slate-400 mt-0.5 italic">
                      {combatant.multiattack_profile}
                    </p>
                  {/if}
                </div>
              </div>

              <!-- AC Badge -->
              <div class="flex items-center gap-1 bg-dark-800 border border-dark-700 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-slate-200">
                <Icons name="shield" size={14} class="text-blue-400" />
                <span>AC {combatant.ac}</span>
              </div>
            </div>

            <!-- Inline HP Adjustment Bar & Stepper -->
            <div class="bg-dark-950/60 border border-dark-800 rounded-xl p-3 mb-3">
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Hit Points
                </span>
                <div class="font-mono text-xs font-bold text-slate-200">
                  <span class={combatant.hp_current === 0 ? 'text-red-500 font-bold' : ''}>
                    {combatant.hp_current}
                  </span>
                  <span class="text-slate-500"> / </span>
                  <span>{combatant.hp_max} HP</span>
                </div>
              </div>

              <!-- HP Progress Bar -->
              <div class="w-full h-2 rounded-full bg-dark-900 border border-dark-700 overflow-hidden mb-2.5">
                <div
                  class="h-full transition-all duration-300 rounded-full {
                    hpPercent > 50
                      ? 'bg-emerald-500'
                      : hpPercent > 20
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }"
                  style="width: {hpPercent}%"
                ></div>
              </div>

              <!-- HP Quick Modifier Buttons -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-dark-800/60 text-xs">
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-slate-400 font-bold uppercase mr-1">Damage:</span>
                  <button
                    onclick={() => handleHpDelta(combatant.id, -1)}
                    class="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-700/50 rounded font-mono text-[11px] text-red-300 font-bold"
                  >
                    -1
                  </button>
                  <button
                    onclick={() => handleHpDelta(combatant.id, -5)}
                    class="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-700/50 rounded font-mono text-[11px] text-red-300 font-bold"
                  >
                    -5
                  </button>
                  <button
                    onclick={() => handleHpDelta(combatant.id, -10)}
                    class="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-700/50 rounded font-mono text-[11px] text-red-300 font-bold"
                  >
                    -10
                  </button>
                </div>

                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-slate-400 font-bold uppercase mr-1">Heal:</span>
                  <button
                    onclick={() => handleHpDelta(combatant.id, 1)}
                    class="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/50 rounded font-mono text-[11px] text-emerald-300 font-bold"
                  >
                    +1
                  </button>
                  <button
                    onclick={() => handleHpDelta(combatant.id, 5)}
                    class="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/50 rounded font-mono text-[11px] text-emerald-300 font-bold"
                  >
                    +5
                  </button>
                  <button
                    onclick={() => handleHpDelta(combatant.id, 10)}
                    class="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/50 rounded font-mono text-[11px] text-emerald-300 font-bold"
                  >
                    +10
                  </button>
                </div>
              </div>
            </div>

            <!-- Conditions Badges & Quick Condition Toggles -->
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[10px] text-slate-400 font-bold uppercase">Conditions:</span>
                {#if combatant.conditions.length === 0}
                  <span class="text-[10px] text-slate-500 italic">None</span>
                {:else}
                  {#each combatant.conditions as cond}
                    <button
                      onclick={() => handleToggleCondition(combatant.id, cond)}
                      class="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/60 text-purple-200 text-[10px] font-bold flex items-center gap-1 hover:border-red-500"
                    >
                      <span>{cond}</span>
                      <span class="text-purple-400 hover:text-red-400">&times;</span>
                    </button>
                  {/each}
                {/if}
              </div>

              <!-- Quick Condition Toggle Pills -->
              <div class="flex flex-wrap items-center gap-1 pt-1">
                {#each ['Poisoned', 'Prone', 'Stunned', 'Blinded', 'Restrained', 'Paralyzed'] as cond}
                  {@const hasCond = combatant.conditions.includes(cond)}
                  <button
                    onclick={() => handleToggleCondition(combatant.id, cond)}
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors {
                      hasCond
                        ? 'bg-purple-900 border-purple-400 text-purple-100'
                        : 'bg-dark-800 hover:bg-dark-700 border-dark-700 text-slate-400'
                    }"
                  >
                    {hasCond ? '✓ ' : '+ '}{cond}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Tactical Procedural Soundboard Quick Actions -->
      <div class="bg-dark-900/90 border border-amber-900/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span class="font-bold text-amber-300 uppercase tracking-wider text-[10px] flex items-center gap-1 font-serif">
          <Icons name="sparkles" size={13} class="text-amber-400" /> Procedural Sound FX:
        </span>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            onclick={() => dispatchSoundEvent('fireball')}
            class="px-2.5 py-1 bg-red-950/60 hover:bg-red-900/80 border border-red-700/50 rounded-lg text-red-300 text-[11px] font-bold"
          >
            Fireball
          </button>
          <button
            onclick={() => dispatchSoundEvent('critical_hit')}
            class="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/50 rounded-lg text-amber-300 text-[11px] font-bold"
          >
            Crit Strike
          </button>
          <button
            onclick={() => dispatchSoundEvent('turn_bell')}
            class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-300 text-[11px] font-bold"
          >
            Turn Bell
          </button>
          <button
            onclick={() => dispatchSoundEvent('potion')}
            class="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 rounded-lg text-emerald-300 text-[11px] font-bold"
          >
            Potion
          </button>
          <button
            onclick={() => dispatchSoundEvent('black_orb_seal')}
            class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/50 rounded-lg text-purple-300 text-[11px] font-bold"
          >
            Black Orb
          </button>
        </div>
      </div>

      <!-- Campaign Disaster Recovery Export Panel -->
      <div class="bg-dark-900 border border-dark-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <Icons name="database" size={16} class="text-amber-400" />
            <h4 class="text-xs font-bold text-slate-100 uppercase tracking-wider font-serif">Campaign Archive Backup</h4>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Single-file SQLite snapshot & asset pack (.aleamos format).
          </p>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <input
            type="text"
            aria-label="Output archive file path"
            bind:value={backupPath}
            class="px-2.5 py-1 bg-dark-950 border border-dark-700 rounded-xl text-xs text-slate-200 font-mono w-full sm:w-44 focus:outline-none focus:border-amber-500"
          />
          <button
            onclick={handleExportArchive}
            disabled={isExportingArchive}
            class="px-3 py-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 shrink-0 flex items-center gap-1"
          >
            {#if isExportingArchive}
              <Icons name="refresh" size={12} class="animate-spin" />
            {:else}
              <Icons name="check" size={12} />
            {/if}
            Backup
          </button>
        </div>
      </div>
      {#if backupFeedback}
        <div class="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between border {
          backupFeedback.isError
            ? 'bg-red-950/80 border-red-500 text-red-200'
            : 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
        }">
          <span>{backupFeedback.message}</span>
          <button onclick={() => (backupFeedback = null)} class="text-slate-400 hover:text-slate-200 text-xs ml-2">&times;</button>
        </div>
      {/if}
    </div>

    <!-- RIGHT SIDE (5 Cols): Compendium drag-and-drop drawer to spawn tokens onto the PixiJS canvas -->
    <div class="lg:col-span-5 space-y-4">
      <div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400">
              <Icons name="crosshair" size={16} />
            </div>
            <div>
              <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider font-serif">
                Compendium Bestiary Spawner
              </h3>
              <p class="text-[10px] text-slate-400">Drag card onto Battle Mat or click Spawn</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded bg-dark-800 text-[10px] font-mono text-amber-300 font-bold border border-dark-700">
            {filteredMonsters.length} Beasts
          </span>
        </div>

        <!-- Search & Filter Controls -->
        <div class="space-y-2">
          <div class="relative">
            <input
              type="text"
              placeholder="Search monsters, types..."
              bind:value={monsterSearch}
              class="w-full bg-dark-950 border border-dark-700 focus:border-amber-500 text-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-xl focus:outline-none"
            />
            <div class="absolute left-2.5 top-2 text-slate-400 pointer-events-none">
              <Icons name="search" size={13} />
            </div>
          </div>

          <!-- CR Filter Pills -->
          <div class="flex items-center gap-1 text-[10px]">
            <span class="text-slate-500 font-semibold uppercase">CR:</span>
            {#each [['all', 'All'], ['low', 'CR 0-2'], ['mid', 'CR 3-8'], ['high', 'CR 9+']] as [val, label]}
              <button
                onclick={() => (selectedCrFilter = val)}
                class="px-2 py-0.5 rounded-md font-mono transition-colors {
                  selectedCrFilter === val
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-dark-800 text-slate-400 hover:text-slate-200'
                }"
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Scrollable Monster Cards List with Drag Support -->
        <div class="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
          {#each filteredMonsters as monster}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              draggable="true"
              ondragstart={(e) => handleMonsterDragStart(e, monster)}
              class="bg-dark-950/90 border border-dark-800 hover:border-amber-500/60 rounded-xl p-3 transition-all cursor-grab active:cursor-grabbing group space-y-2 shadow-sm"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <h4 class="font-bold text-xs text-slate-100 font-serif group-hover:text-amber-300 transition-colors">
                      {monster.name}
                    </h4>
                  </div>
                  <p class="text-[10px] text-slate-400 mt-0.5">
                    {monster.size} {monster.creature_type} &bull; {monster.alignment}
                  </p>
                </div>

                <div class="flex flex-col items-end gap-1">
                  <span class="px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 text-amber-300 font-mono font-bold text-[10px]">
                    CR {monster.challenge_rating}
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">
                    AC {monster.ac} | {monster.hp_max} HP
                  </span>
                </div>
              </div>

              {#if monster.multiattack_profile}
                <p class="text-[10px] text-amber-200/70 italic border-l-2 border-amber-500/40 pl-2 py-0.5">
                  {monster.multiattack_profile}
                </p>
              {/if}

              <!-- Action Bar: Drag handle indicator & Direct Spawn Button -->
              <div class="flex items-center justify-between pt-1 border-t border-dark-800/80 text-[11px]">
                <span class="text-[10px] text-slate-500 flex items-center gap-1">
                  <Icons name="layers" size={12} class="text-slate-400" />
                  Drag to Mat
                </span>

                <button
                  onclick={() => spawnMonsterOntoCanvas(monster)}
                  class="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 border border-red-500/40 hover:border-red-400 rounded-lg text-red-200 font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  <Icons name="plus" size={11} />
                  Spawn Token
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
