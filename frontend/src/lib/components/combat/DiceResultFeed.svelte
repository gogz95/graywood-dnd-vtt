<!-- src/lib/components/combat/DiceResultFeed.svelte -->
<!-- Assisted Damage Application Feed with Full / Half / Crit / Heal Action Chips (Svelte 5 Runes) -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { combatStore } from '../../stores/combatStore.svelte';
  import type { DiceResultItem } from '../mobile/MobileDiceTray.svelte';

  export type DamageModifier = 'full' | 'half' | 'double' | 'heal';

  interface TargetOption {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    isPlayer?: boolean;
  }

  interface Props {
    socket?: WebSocket | null;
    selectedTargetId?: string;
    rolls?: DiceResultItem[];
    onApplyDamage?: (targetId: string, amount: number, modifier: DamageModifier) => void;
    compact?: boolean;
  }

  let {
    socket = null,
    selectedTargetId = $bindable(''),
    rolls = $bindable<DiceResultItem[]>([]),
    onApplyDamage,
    compact = false,
  }: Props = $props();

  // ── Internal WebSocket fallback if not passed via props ───────────────────
  let internalWs = $state<WebSocket | null>(null);
  let isConnected = $state(false);
  let feedbackMessage = $state<{ text: string; type: 'damage' | 'heal' | 'info'; timestamp: number } | null>(null);
  let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  // Active WebSocket reference
  const activeSocket = $derived(socket ?? internalWs);

  // Collect combatants and tokens into selectable target list
  const availableTargets = $derived.by<TargetOption[]>(() => {
    const list: TargetOption[] = [];
    const seen = new Set<string>();

    // 1. First priority: active combatants in combat tracker
    for (const c of combatStore.combatants) {
      if (!seen.has(c.tokenId)) {
        seen.add(c.tokenId);
        list.push({
          id: c.tokenId,
          name: c.name,
          hp: c.hp,
          maxHp: c.maxHp,
          isPlayer: false,
        });
      }
    }

    // 2. Battlemap tokens
    for (const t of tokenStore.tokens) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        list.push({
          id: t.id,
          name: t.name,
          hp: t.hp,
          maxHp: t.maxHp,
          isPlayer: t.isPlayer,
        });
      }
    }

    return list;
  });

  // Selected target details
  const selectedTarget = $derived(
    availableTargets.find((t) => t.id === selectedTargetId) ?? null
  );

  // Auto-sync with tokenStore selection if none manually chosen
  $effect(() => {
    if (!selectedTargetId && tokenStore.selectedTokenId) {
      selectedTargetId = tokenStore.selectedTokenId;
    } else if (!selectedTargetId && combatStore.activeCombatant) {
      selectedTargetId = combatStore.activeCombatant.tokenId;
    }
  });

  onMount(() => {
    if (!socket) {
      initCompanionWs();
    }
  });

  onDestroy(() => {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    if (internalWs) {
      try {
        internalWs.close();
      } catch {
        // ignore
      }
      internalWs = null;
    }
  });

  function initCompanionWs() {
    if (typeof window === 'undefined') return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      const port =
        window.location.port === '5173'
          ? 5174
          : parseInt(window.location.port, 10) || 5174;
      const wsUrl = `${protocol}//${host}:${port}/ws/companion`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        isConnected = true;
        // Authenticate as DM
        ws.send(
          JSON.stringify({
            type: 'Auth',
            pin: '1337',
            device_name: 'DM Workstation',
            role: 'dm',
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'DiceResult') {
            const newItem: DiceResultItem = {
              roll_id: msg.roll_id || `roll-${Date.now()}`,
              roller: msg.roller || 'Companion',
              expression: msg.expression || '',
              total: typeof msg.total === 'number' ? msg.total : 0,
              breakdown: msg.breakdown || '',
              timestamp: Date.now(),
            };
            rolls = [newItem, ...rolls.slice(0, 49)];
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onclose = () => {
        isConnected = false;
        internalWs = null;
      };

      ws.onerror = () => {
        isConnected = false;
      };

      internalWs = ws;
    } catch {
      // offline or mock
    }
  }

  // ── Dispatch ApplyDamage ───────────────────────────────────────────────────
  export function applyDamageToTarget(
    targetId: string,
    amount: number,
    modifier: DamageModifier,
    rollSummary?: string
  ) {
    if (!targetId) return;

    const payload = {
      type: 'ApplyDamage',
      target_entity_id: targetId,
      amount,
      modifier,
    };

    // 1. Dispatch over WebSocket
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      activeSocket.send(JSON.stringify(payload));
    }

    // 2. Proactively update local tokenStore for immediate responsiveness
    const targetToken = tokenStore.tokens.find((t) => t.id === targetId);
    let delta = 0;
    if (modifier === 'heal') {
      delta = amount;
    } else if (modifier === 'half') {
      delta = -Math.floor(amount / 2);
    } else if (modifier === 'double') {
      delta = -(amount * 2);
    } else {
      delta = -amount;
    }

    if (targetToken) {
      const nextHp = Math.max(0, Math.min(targetToken.maxHp, targetToken.hp + delta));
      tokenStore.updateToken(targetId, { hp: nextHp });
    }

    // 3. Proactively update combatant if present in combatStore
    const comb = combatStore.combatants.find((c) => c.tokenId === targetId);
    if (comb) {
      comb.hp = Math.max(0, Math.min(comb.maxHp, comb.hp + delta));
      comb.isDefeated = comb.hp <= 0;
    }

    // 4. Callback
    onApplyDamage?.(targetId, amount, modifier);

    // 5. Visual toast confirmation
    const targetName = selectedTarget?.name || 'Target';
    const sign = delta > 0 ? `+${delta} HP (Heal)` : `${delta} HP (${modifier.toUpperCase()})`;
    showFeedback(`${targetName}: ${sign} from [${amount}]`, delta > 0 ? 'heal' : 'damage');
  }

  function showFeedback(text: string, type: 'damage' | 'heal' | 'info') {
    feedbackMessage = { text, type, timestamp: Date.now() };
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
      feedbackMessage = null;
    }, 3500);
  }

  // Quick dice rolling helper for DM testing or quick combat resolution
  function quickRollDamage(expr: string) {
    let count = 1;
    let sides = 6;
    let mod = 0;

    const match = expr.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (match) {
      count = parseInt(match[1], 10);
      sides = parseInt(match[2], 10);
      mod = match[3] ? parseInt(match[3], 10) : 0;
    }

    const rollsArr: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      rollsArr.push(r);
      sum += r;
    }
    const total = Math.max(1, sum + mod);
    const breakdown = `${expr} -> [${rollsArr.join(', ')}]${mod >= 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`}`;

    const newRoll: DiceResultItem = {
      roll_id: `roll-${Date.now()}`,
      roller: 'DM (Damage)',
      expression: expr,
      total,
      breakdown,
      timestamp: Date.now(),
    };

    rolls = [newRoll, ...rolls.slice(0, 49)];
  }
</script>

<div class="flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl {compact ? 'p-2.5 text-xs' : 'p-4'}">
  <!-- ═════════════════════════════════════════════════════════════════════════
       HEADER & TARGET COMBATANT SELECTOR
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
    <div class="flex items-center gap-2">
      <span class="text-sm">🎯</span>
      <h3 class="text-xs font-black uppercase tracking-wider text-slate-200">
        Assisted Damage Feed
      </h3>
      {#if isConnected}
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Companion WS Connected"></span>
      {/if}
    </div>

    <!-- Target Selector -->
    <div class="flex items-center gap-1.5 min-w-[200px]">
      <label for="damage-target-select" class="text-[11px] font-bold text-slate-400 uppercase">
        Target:
      </label>
      <select
        id="damage-target-select"
        bind:value={selectedTargetId}
        class="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-300 focus:outline-none focus:border-indigo-500 max-w-[180px] truncate"
      >
        <option value="">-- Select Target --</option>
        {#each availableTargets as t}
          <option value={t.id}>
            {t.name} (HP {t.hp}/{t.maxHp})
          </option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Selected Target Banner -->
  {#if selectedTarget}
    <div class="flex items-center justify-between px-3 py-1.5 my-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
        <span class="font-bold text-slate-100">{selectedTarget.name}</span>
      </div>
      <div class="font-mono text-[11px] font-bold text-indigo-300">
        HP {selectedTarget.hp} / {selectedTarget.maxHp}
      </div>
    </div>
  {:else}
    <div class="px-3 py-1.5 my-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-amber-400/90 flex items-center gap-1.5">
      <span>⚠️</span>
      <span>Select a target above (or click a token on canvas) to enable quick damage buttons.</span>
    </div>
  {/if}

  <!-- Feedback Toast -->
  {#if feedbackMessage}
    <div
      class="mb-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all animate-in fade-in flex items-center justify-between {feedbackMessage.type === 'heal'
        ? 'bg-emerald-950 border border-emerald-500 text-emerald-200'
        : 'bg-rose-950 border border-rose-500 text-rose-200'}"
    >
      <span>{feedbackMessage.text}</span>
      <span class="text-[10px] opacity-75 font-mono">Dispatched</span>
    </div>
  {/if}

  <!-- Quick Roll Buttons for DM -->
  <div class="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-none">
    <span class="text-[10px] font-bold uppercase text-slate-500 whitespace-nowrap">DM Roll:</span>
    {#each ['1d6', '1d8', '1d10', '2d6', '3d6', '8d6'] as expr}
      <button
        type="button"
        onclick={() => quickRollDamage(expr)}
        class="px-2 py-0.5 rounded-md bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 text-[10px] font-mono font-bold text-slate-300 transition-colors whitespace-nowrap"
      >
        {expr}
      </button>
    {/each}
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       DICE ROLL FEED & DAMAGE ACTION CHIPS
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
    {#if rolls.length === 0}
      <div class="p-6 rounded-xl bg-slate-950/40 border border-slate-800 text-center space-y-1">
        <span class="text-xl opacity-60">⚔️</span>
        <p class="text-xs text-slate-400 font-semibold">No damage rolls recorded yet</p>
        <p class="text-[10px] text-slate-500">
          Rolls from players or DM quick-rollers will stream here with instant damage chips.
        </p>
      </div>
    {:else}
      {#each rolls as roll (roll.roll_id || `${roll.roller}-${roll.total}-${Math.random()}`)}
        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-all space-y-2">
          <!-- Roll Header -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-bold text-slate-200 truncate">{roll.roller}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-400">
                {roll.expression}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-lg font-black font-mono text-indigo-400">
                {roll.total}
              </span>
            </div>
          </div>

          <!-- Breakdown -->
          {#if roll.breakdown}
            <div class="text-[11px] font-mono text-slate-400 truncate">
              {roll.breakdown}
            </div>
          {/if}

          <!-- 4 QUICK ACTION BUTTONS (WHEN TARGET IS SELECTED) -->
          {#if selectedTargetId}
            <div class="flex items-center gap-1.5 pt-1.5 border-t border-slate-800/80 flex-wrap">
              <!-- [Full] (Red) -->
              <button
                type="button"
                onclick={() => applyDamageToTarget(selectedTargetId, roll.total, 'full')}
                class="flex-1 min-w-[55px] py-1 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-rose-950/60 flex items-center justify-center gap-1"
                title={`Apply ${roll.total} full damage`}
              >
                <span>Full</span>
                <span class="text-[10px] opacity-80 font-mono">(-{roll.total})</span>
              </button>

              <!-- [Half] (Amber) -->
              <button
                type="button"
                onclick={() => applyDamageToTarget(selectedTargetId, roll.total, 'half')}
                class="flex-1 min-w-[55px] py-1 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-amber-950/60 flex items-center justify-center gap-1"
                title={`Apply ${Math.floor(roll.total / 2)} half damage`}
              >
                <span>Half</span>
                <span class="text-[10px] opacity-80 font-mono">(-{Math.floor(roll.total / 2)})</span>
              </button>

              <!-- [Crit] (Purple) -->
              <button
                type="button"
                onclick={() => applyDamageToTarget(selectedTargetId, roll.total, 'double')}
                class="flex-1 min-w-[55px] py-1 px-2 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-purple-950/60 flex items-center justify-center gap-1"
                title={`Apply ${roll.total * 2} critical/double damage`}
              >
                <span>Crit</span>
                <span class="text-[10px] opacity-80 font-mono">(-{roll.total * 2})</span>
              </button>

              <!-- [Heal] (Emerald) -->
              <button
                type="button"
                onclick={() => applyDamageToTarget(selectedTargetId, roll.total, 'heal')}
                class="flex-1 min-w-[55px] py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-emerald-950/60 flex items-center justify-center gap-1"
                title={`Heal ${roll.total} HP`}
              >
                <span>Heal</span>
                <span class="text-[10px] opacity-80 font-mono">(+{roll.total})</span>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
