<!-- InitiativeTrackerDrawer.svelte — Collapsible 5e Combat Initiative & Condition Manager -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { combatStore, type Combatant } from '../../stores/combatStore.svelte';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
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

  // ── Zone-Based Combatant Detection (AoE Templates & Attached Token Auras) ──
  interface DetectedZone {
    id: string;
    label: string;
    cx: number;
    cy: number;
    radiusPx: number;
  }

  function circleIntersectsToken(
    cx: number,
    cy: number,
    r: number,
    tok: { x: number; y: number; size: number }
  ): boolean {
    const gridSize = canvasStore.gridSize || 60;
    const footprint = (tok.size || 1) * gridSize;
    const xMin = tok.x - footprint / 2;
    const xMax = tok.x + footprint / 2;
    const yMin = tok.y - footprint / 2;
    const yMax = tok.y + footprint / 2;

    const closestX = Math.max(xMin, Math.min(cx, xMax));
    const closestY = Math.max(yMin, Math.min(cy, yMax));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
  }

  const activeZones = $derived.by(() => {
    const zones: DetectedZone[] = [];
    const gridSize = canvasStore.gridSize || 60;

    // 1. Attached Token Auras
    for (const tok of tokenStore.tokens) {
      if (tok.auras && tok.auras.length > 0) {
        for (const aura of tok.auras) {
          zones.push({
            id: aura.id,
            label: `${tok.name} (${aura.radiusFeet}ft Aura)`,
            cx: tok.x,
            cy: tok.y,
            radiusPx: (aura.radiusFeet / 5) * gridSize,
          });
        }
      }
    }

    // 2. Active AoE Templates on Canvas
    for (const aoe of canvasStore.aoeTemplates) {
      const radiusPx = ((aoe.sizeFeet || 20) / 5) * gridSize;
      zones.push({
        id: aoe.id,
        label: aoe.label || `${aoe.type} (${aoe.sizeFeet || 20}ft)`,
        cx: aoe.originX,
        cy: aoe.originY,
        radiusPx,
      });
    }

    return zones;
  });

  let selectedZoneId = $state<string | null>(null);
  const currentZone = $derived(
    activeZones.find((z) => z.id === selectedZoneId) || activeZones[0] || null
  );

  const tokensInCurrentZone = $derived.by(() => {
    if (!currentZone) return [];
    return tokenStore.tokens.filter((tok) =>
      circleIntersectsToken(currentZone.cx, currentZone.cy, currentZone.radiusPx, tok)
    );
  });

  // Targeted combatant IDs for mass-actions
  let targetedTokenIds = $state<string[]>([]);

  function selectTokensInZone() {
    targetedTokenIds = tokensInCurrentZone.map((t) => t.id);
  }

  function applyBatchDamage(damage: number) {
    if (targetedTokenIds.length === 0) return;
    for (const id of targetedTokenIds) {
      const combatant = combatStore.combatants.find((c) => c.tokenId === id);
      if (combatant) {
        applyHpDelta(combatant, -damage);
      } else {
        tokenStore.updateHp(id, -damage);
      }
    }
  }

  function applyBatchCondition(condName: string) {
    if (targetedTokenIds.length === 0) return;
    for (const id of targetedTokenIds) {
      toggleCondition(id, condName, 10);
      tokenStore.toggleCondition(id, condName);
    }
  }

  function applyHpDelta(combatant: Combatant, delta: number) {
    if (delta < 0) {
      const damage = Math.abs(delta);
      combatant.hp = Math.max(0, combatant.hp - damage);
      if (combatant.hp <= 0) combatant.isDefeated = true;
      tokenStore.updateHp(combatant.tokenId, -damage);
      if (combatant.conditions.some((c) => c.toLowerCase() === 'concentrating')) {
        combatStore.triggerConcentrationCheck(combatant.tokenId, combatant.name, damage);
      }
    } else {
      combatant.hp = Math.min(combatant.maxHp, combatant.hp + delta);
      if (combatant.hp > 0) combatant.isDefeated = false;
      tokenStore.updateHp(combatant.tokenId, delta);
    }
  }

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

    <!-- Zone-Based Combatant Detection Bar -->
    {#if currentZone}
      <div class="px-3 py-2 bg-slate-950/90 border-b border-indigo-900/40 flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-xs">🎯</span>
            {#if activeZones.length > 1}
              <select
                class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-indigo-300 max-w-[150px] truncate"
                value={currentZone.id}
                onchange={(e) => selectedZoneId = e.currentTarget.value}
              >
                {#each activeZones as z}
                  <option value={z.id}>{z.label}</option>
                {/each}
              </select>
            {:else}
              <span class="font-bold text-indigo-300 truncate max-w-[150px]">{currentZone.label}</span>
            {/if}
          </div>

          <!-- Action Chip: "Select X In Zone" -->
          <button
            type="button"
            class="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold rounded-lg text-[10px] shadow-sm transition-all flex items-center gap-1"
            onclick={selectTokensInZone}
            title="Mass-target all creatures within this zone template"
          >
            <span>✨</span>
            <span>Select {tokensInCurrentZone.length} In Zone</span>
          </button>
        </div>

        <!-- Mass-targeting quick controls (when targets selected) -->
        {#if targetedTokenIds.length > 0}
          <div class="flex items-center justify-between gap-1 pt-1 border-t border-slate-800 text-[10px]">
            <span class="font-mono text-cyan-300 font-semibold">{targetedTokenIds.length} targeted:</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="px-1.5 py-0.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded font-bold"
                onclick={() => applyBatchDamage(10)}
                title="Deal 10 damage to all targeted"
              >
                -10
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded font-bold"
                onclick={() => applyBatchDamage(5)}
                title="Deal 5 damage to all targeted"
              >
                -5
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 rounded"
                onclick={() => applyBatchCondition('Prone')}
                title="Apply Prone to all"
              >
                Prone
              </button>
              <button
                type="button"
                class="text-slate-400 hover:text-white px-1"
                onclick={() => targetedTokenIds = []}
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}


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
          {@const isTargeted = targetedTokenIds.includes(combatant.tokenId)}
          {@const conditions = conditionMap[combatant.tokenId] || []}
          <div
            class="p-2.5 rounded-xl border transition-all {isTargeted ? 'ring-2 ring-cyan-400 bg-cyan-950/40 border-cyan-500' : isActive ? 'bg-indigo-950/70 border-indigo-500 shadow-lg shadow-indigo-950/60 ring-1 ring-indigo-400' : 'bg-slate-950/70 border-slate-800'}"
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
                <span class="font-bold text-white truncate max-w-[130px]">{combatant.name}</span>
                {#if isTargeted}
                  <span class="px-1 py-0.2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded text-[9px] font-mono">
                    TARGET
                  </span>
                {/if}
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
                  class="w-4 h-4 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-300 font-bold"
                  onclick={() => applyHpDelta(combatant, -1)}
                  title="-1 HP"
                >
                  -
                </button>
                <button
                  type="button"
                  class="w-4 h-4 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-300 font-bold"
                  onclick={() => applyHpDelta(combatant, 1)}
                  title="+1 HP"
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

<!-- ── High-Priority Automated Concentration Check Modal ───────────────────── -->
{#if combatStore.activeConcentrationPrompt}
  {@const prompt = combatStore.activeConcentrationPrompt}
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none pointer-events-auto">
    <div class="bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-100 flex flex-col gap-4 animate-scale-up">
      <!-- Header -->
      <div class="flex items-center gap-3 pb-3 border-b border-slate-800">
        <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-xl text-amber-400">
          ⚡
        </div>
        <div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wider">Concentration Check</h3>
          <p class="text-[11px] text-amber-400 font-mono">DC {prompt.dc} &bull; Took {prompt.damageTaken} Damage</p>
        </div>
      </div>

      <!-- Prompt Text -->
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed text-slate-300">
        <div class="font-medium text-slate-200">
          Concentration Check Required: DC {prompt.dc}. Roll CON Save?
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          Target: <span class="font-bold text-white">{prompt.entityName}</span>
        </p>
      </div>

      <!-- Result Banner (After Roll) -->
      {#if prompt.rollResult}
        <div class="p-3 rounded-xl border flex items-center justify-between {prompt.rollResult.success ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' : 'bg-rose-950/80 border-rose-500 text-rose-200'}">
          <div class="flex items-center gap-2">
            <span class="text-xl">{prompt.rollResult.success ? '✅' : '💥'}</span>
            <div>
              <span class="text-xs font-bold block">{prompt.rollResult.success ? 'Save Succeeded!' : 'Save Failed!'}</span>
              <span class="text-[10px] font-mono">d20({prompt.rollResult.d20}) + {prompt.conModifier} = {prompt.rollResult.total} vs DC {prompt.dc}</span>
            </div>
          </div>

          {#if !prompt.rollResult.success}
            <button
              type="button"
              class="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs shadow-md transition-all animate-pulse"
              onclick={() => combatStore.dropConcentration(prompt.entityId)}
            >
              Drop Concentration
            </button>
          {/if}
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 pt-1">
        {#if !prompt.rollResult}
          <button
            type="button"
            class="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-1.5"
            onclick={() => {
              combatStore.rollConcentrationSave();
              audioEngine.triggerSfx('sfx-dice');
            }}
          >
            <span>🎲</span>
            <span>Roll Save</span>
          </button>
        {/if}

        <button
          type="button"
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-xs transition-colors"
          onclick={() => combatStore.dismissConcentrationPrompt()}
        >
          {prompt.rollResult ? 'Done' : 'Dismiss'}
        </button>
      </div>
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
