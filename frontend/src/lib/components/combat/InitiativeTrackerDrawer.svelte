<!-- InitiativeTrackerDrawer.svelte — Collapsible 5e Combat Initiative & Condition Manager -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { combatStore, type Combatant } from '../../stores/combatStore.svelte';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import DiceResultFeed from './DiceResultFeed.svelte';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    onClose,
  }: Props = $props();

  // ── Condition Durations (Rounds remaining) ──────────────────────────────────
  interface ActiveCondition {
    name: string;
    icon: string;
    roundsRemaining: number;
  }

  const STANDARD_CONDITIONS = [
    { name: 'Blinded', icon: '👁️' },
    { name: 'Charmed', icon: '💖' },
    { name: 'Concentrating', icon: '⚡' },
    { name: 'Deafened', icon: '👂' },
    { name: 'Frightened', icon: '😱' },
    { name: 'Grappled', icon: '✊' },
    { name: 'Incapacitated', icon: '🌀' },
    { name: 'Invisible', icon: '👻' },
    { name: 'Paralyzed', icon: '⚡' },
    { name: 'Petrified', icon: '🗿' },
    { name: 'Poisoned', icon: '🤢' },
    { name: 'Prone', icon: '🛌' },
    { name: 'Restrained', icon: '⛓️' },
    { name: 'Stunned', icon: '💫' },
    { name: 'Unconscious', icon: '💤' },
  ];

  let conditionMap = $state<Record<string, ActiveCondition[]>>({});

  // Inline custom combatant input
  let showAddCustom = $state(false);
  let newName = $state('');
  let newHp = $state(20);
  let newAc = $state(12);
  let newDexMod = $state(0);
  let newIsPlayer = $state(false);

  // Broadcast channel for mobile companion turn alerts
  let broadcastChannel: BroadcastChannel | null = null;

  onMount(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastChannel = new BroadcastChannel('dnd_battlemat_sync');
      } catch {}
    }
  });

  onDestroy(() => {
    if (broadcastChannel) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  });

  // ── Sync Active Players into Combat Roster ─────────────────────────────────
  function addActivePlayerTokens() {
    const playerTokens = tokenStore.tokens.filter((t) => t.isPlayer);
    for (const tok of playerTokens) {
      if (!combatStore.combatants.some((c) => c.tokenId === tok.id)) {
        const combatant: Combatant = {
          tokenId: tok.id,
          name: tok.name,
          initiative: Math.floor(Math.random() * 20) + 1,
          dexModifier: 0,
          hp: tok.hp,
          maxHp: tok.maxHp,
          conditions: [...tok.conditions],
          isDefeated: tok.hp <= 0,
        };
        combatStore.combatants.push(combatant);
      }
    }
    sortRoster();
  }

  // ── Auto-Roll All Initiatives ──────────────────────────────────────────────
  function rollAllInitiative() {
    for (const c of combatStore.combatants) {
      const roll = Math.floor(Math.random() * 20) + 1;
      c.initiative = roll + (c.dexModifier || 0);
    }
    sortRoster();
    audioEngine.triggerSfx('sfx-dice');
  }

  function sortRoster() {
    combatStore.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      if (b.dexModifier !== a.dexModifier) return b.dexModifier - a.dexModifier;
      return a.name.localeCompare(b.name);
    });
  }

  // ── Turn Controls & Mobile Turn Notification ──────────────────────────────
  function handleNextTurn() {
    combatStore.nextTurn();
    notifyActivePlayerTurn();
    decrementActiveConditions();
    audioEngine.triggerSfx('sfx-rest');
  }

  function handlePreviousTurn() {
    combatStore.previousTurn();
    notifyActivePlayerTurn();
  }

  function notifyActivePlayerTurn() {
    const active = combatStore.activeCombatant;
    if (!active) return;

    // Broadcast across companion WebSocket and BroadcastChannel
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'ACTIVE_TURN_ALERT',
        character_name: active.name,
        round: combatStore.round,
        turnIndex: combatStore.turnIndex,
      });
    }
  }

  // ── Condition Duration Management ──────────────────────────────────────────
  function toggleCondition(combatantId: string, condName: string, defaultRounds = 10) {
    const condList = conditionMap[combatantId] || [];
    const existingIdx = condList.findIndex((c) => c.name === condName);

    if (existingIdx >= 0) {
      condList.splice(existingIdx, 1);
    } else {
      const def = STANDARD_CONDITIONS.find((s) => s.name === condName);
      condList.push({
        name: condName,
        icon: def?.icon || '⚠️',
        roundsRemaining: defaultRounds,
      });
    }

    conditionMap[combatantId] = [...condList];

    // Sync with combatant.conditions
    const c = combatStore.combatants.find((cb) => cb.tokenId === combatantId);
    if (c) {
      c.conditions = condList.map((cl) => cl.name);
    }
  }

  function decrementActiveConditions() {
    const active = combatStore.activeCombatant;
    if (!active) return;

    const list = conditionMap[active.tokenId];
    if (!list) return;

    for (let i = list.length - 1; i >= 0; i--) {
      list[i].roundsRemaining -= 1;
      if (list[i].roundsRemaining <= 0) {
        list.splice(i, 1);
      }
    }

    conditionMap[active.tokenId] = [...list];
    active.conditions = list.map((l) => l.name);
  }

  // ── Custom Combatant Submission ────────────────────────────────────────────
  function addCustomCombatant() {
    if (!newName.trim()) return;

    const newCombatant: Combatant = {
      tokenId: `custom-${Date.now()}`,
      name: newName.trim(),
      initiative: Math.floor(Math.random() * 20) + 1 + newDexMod,
      dexModifier: newDexMod,
      hp: newHp,
      maxHp: newHp,
      conditions: [],
      isDefeated: false,
    };

    combatStore.combatants.push(newCombatant);
    sortRoster();

    newName = '';
    showAddCustom = false;
  }
</script>

{#if isOpen}
  <!-- ── Slide-Over Initiative Tracker Drawer ───────────────────────────────── -->
  <div
    class="fixed top-0 right-0 z-50 h-full w-96 bg-slate-900/95 border-l border-slate-700/80 shadow-2xl backdrop-blur-md flex flex-col font-sans text-xs text-slate-100 animate-slide-left select-none"
    role="dialog"
    tabindex="-1"
    aria-label="Encounter Initiative Tracker"
  >
    <!-- Drawer Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="text-base">⚔️</span>
        <div>
          <h2 class="font-bold text-white text-sm">Initiative Tracker</h2>
          <span class="text-[10px] font-mono text-indigo-400">
            {combatStore.isActive ? `Round ${combatStore.round}` : 'Combat Idle'}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if !combatStore.isActive}
          <button
            type="button"
            class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-sm"
            onclick={() => { combatStore.startCombat(); notifyActivePlayerTurn(); }}
          >
            Start
          </button>
        {:else}
          <button
            type="button"
            class="px-2 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold rounded-lg transition-colors text-[10px]"
            onclick={() => combatStore.endCombat()}
          >
            End
          </button>
        {/if}

        <button
          type="button"
          class="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          onclick={() => { isOpen = false; onClose?.(); }}
          title="Close Drawer"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Turn Controls & Actions Bar -->
    <div class="p-3 bg-slate-950/60 border-b border-slate-800 flex flex-col gap-2">
      <!-- Turn Navigation -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm disabled:opacity-40"
          onclick={handlePreviousTurn}
          disabled={!combatStore.isActive || combatStore.combatants.length === 0}
        >
          ◀ Prev Turn
        </button>

        <button
          type="button"
          class="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm shadow-indigo-600/30 disabled:opacity-40"
          onclick={handleNextTurn}
          disabled={!combatStore.isActive || combatStore.combatants.length === 0}
        >
          Next Turn ▶
        </button>
      </div>

      <!-- Quick Action Buttons -->
      <div class="grid grid-cols-3 gap-1.5 pt-1">
        <button
          type="button"
          class="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded text-[10px] font-medium truncate"
          onclick={addActivePlayerTokens}
          title="Add all active player tokens on battlemat to roster"
        >
          + Add PCs
        </button>
        <button
          type="button"
          class="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[10px] font-medium truncate"
          onclick={rollAllInitiative}
          title="Roll initiative for all combatants"
        >
          🎲 Roll All
        </button>
        <button
          type="button"
          class="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-medium truncate"
          onclick={() => showAddCustom = !showAddCustom}
          title="Add custom combatant"
        >
          + Custom
        </button>
      </div>
    </div>

    <!-- Custom Combatant Inline Adder -->
    {#if showAddCustom}
      <div class="p-3 bg-slate-950 border-b border-indigo-900/60 flex flex-col gap-2">
        <div class="flex items-center justify-between text-[11px] font-bold text-indigo-300">
          <span>New Combatant</span>
          <button type="button" class="text-slate-500 hover:text-white" onclick={() => showAddCustom = false}>✕</button>
        </div>
        <input
          type="text"
          placeholder="Character or Monster Name"
          bind:value={newName}
          class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <div class="grid grid-cols-3 gap-2">
          <div>
            <span class="text-[9px] text-slate-400 block">HP</span>
            <input type="number" bind:value={newHp} class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white" />
          </div>
          <div>
            <span class="text-[9px] text-slate-400 block">AC</span>
            <input type="number" bind:value={newAc} class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white" />
          </div>
          <div>
            <span class="text-[9px] text-slate-400 block">DEX Mod</span>
            <input type="number" bind:value={newDexMod} class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white" />
          </div>
        </div>
        <button
          type="button"
          class="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs transition-colors mt-1"
          onclick={addCustomCombatant}
        >
          Add to Encounter
        </button>
      </div>
    {/if}

    <!-- Roster List -->
    <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
      {#if combatStore.combatants.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
          <span class="text-3xl mb-2">🛡️</span>
          <span class="font-medium text-xs">No Combatants in Encounter</span>
          <span class="text-[11px] text-slate-600 mt-1">Click "+ Add PCs" or "+ Custom" to begin</span>
        </div>
      {:else}
        {#each combatStore.combatants as combatant, idx}
          {@const isActive = combatStore.isActive && combatStore.turnIndex === idx}
          {@const conditions = conditionMap[combatant.tokenId] || []}
          <div
            class="p-2.5 rounded-xl border transition-all {isActive ? 'bg-indigo-950/70 border-indigo-500 shadow-lg shadow-indigo-950/60 ring-1 ring-indigo-400' : 'bg-slate-950/70 border-slate-800'}"
          >
            <!-- Combatant Top Row: Initiative, Name, Turn Badge -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <!-- Initiative Input Box -->
                <input
                  type="number"
                  bind:value={combatant.initiative}
                  onchange={() => sortRoster()}
                  class="w-10 text-center bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono font-bold text-amber-300 text-xs"
                />
                <span class="font-bold text-white truncate max-w-[150px]">{combatant.name}</span>
              </div>

              {#if isActive}
                <span class="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full animate-pulse shadow-sm">
                  ACTIVE TURN
                </span>
              {/if}
            </div>

            <!-- Stats: HP Tracker & Defeated Toggle -->
            <div class="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-800/80">
              <div class="flex items-center gap-1.5">
                <span class="text-slate-400">HP:</span>
                <span class="font-mono font-bold text-emerald-400">{combatant.hp}/{combatant.maxHp}</span>
                <button
                  type="button"
                  class="w-4 h-4 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-300"
                  onclick={() => combatant.hp = Math.max(0, combatant.hp - 1)}
                >
                  -
                </button>
                <button
                  type="button"
                  class="w-4 h-4 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-300"
                  onclick={() => combatant.hp = Math.min(combatant.maxHp, combatant.hp + 1)}
                >
                  +
                </button>
              </div>

              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="text-[10px] px-1.5 py-0.5 rounded {combatant.isDefeated ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'text-slate-500 hover:text-slate-300'}"
                  onclick={() => combatant.isDefeated = !combatant.isDefeated}
                >
                  {combatant.isDefeated ? '💀 Down' : 'Alive'}
                </button>
                <button
                  type="button"
                  class="text-slate-500 hover:text-rose-400 p-0.5"
                  onclick={() => { combatStore.combatants = combatStore.combatants.filter((c) => c.tokenId !== combatant.tokenId); }}
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Active Conditions & Quick Adder -->
            <div class="mt-2 flex flex-wrap items-center gap-1">
              {#each conditions as cond}
                <button
                  type="button"
                  class="px-1.5 py-0.5 bg-slate-900 border border-cyan-800/60 rounded text-[9px] font-mono text-cyan-300 flex items-center gap-1 hover:border-rose-500"
                  onclick={() => toggleCondition(combatant.tokenId, cond.name)}
                  title="Click to remove condition"
                >
                  <span>{cond.icon}</span>
                  <span>{cond.name}</span>
                  <span class="text-cyan-400 font-bold">({cond.roundsRemaining}r)</span>
                </button>
              {/each}

              <!-- Condition Selector Menu -->
              <div class="relative group">
                <button
                  type="button"
                  class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[9px] text-slate-300"
                  title="Add condition status"
                >
                  + Cond
                </button>
                <div class="absolute left-0 bottom-full mb-1 hidden group-hover:grid grid-cols-3 gap-1 p-2 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl z-30 w-52">
                  {#each STANDARD_CONDITIONS as sc}
                    <button
                      type="button"
                      class="px-1 py-0.5 bg-slate-900 hover:bg-indigo-900 text-[9px] rounded text-left truncate text-slate-300 hover:text-white"
                      onclick={() => toggleCondition(combatant.tokenId, sc.name, 10)}
                    >
                      {sc.icon} {sc.name}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Live Assisted Damage Feed -->
    <div class="p-3 border-t border-slate-800 bg-slate-950/70">
      <DiceResultFeed
        compact={true}
        selectedTargetId={combatStore.activeCombatant?.tokenId ?? ''}
      />
    </div>
  </div>
{/if}

<style>
  @keyframes slideLeft {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .animate-slide-left {
    animation: slideLeft 0.25s ease-out forwards;
  }
</style>
