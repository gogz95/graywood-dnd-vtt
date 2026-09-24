<!-- src/lib/components/mobile/MobileDiceTray.svelte -->
<!-- Mobile Quick Dice Roller Tray & Roll History Feed (Svelte 5 Runes) -->

<script lang="ts">
  export interface DiceResultItem {
    roll_id: string;
    roller: string;
    expression: string;
    total: number;
    breakdown: string;
    timestamp?: number;
  }

  let {
    characterName = 'Player Companion',
    socket = null,
    rollHistory = $bindable<DiceResultItem[]>([]),
    onRoll,
  }: {
    characterName?: string;
    socket?: WebSocket | null;
    rollHistory?: DiceResultItem[];
    onRoll?: (formula: string) => void;
  } = $props();

  // ── Svelte 5 Rune State ───────────────────────────────────────────────────
  // Pool of dice counts by sides
  let diceCounts = $state<{ [sides: number]: number }>({
    4: 0,
    6: 0,
    8: 0,
    10: 0,
    12: 0,
    20: 0,
    100: 0,
  });

  let modifier = $state(0);
  let advMode = $state<'normal' | 'adv' | 'dis'>('normal');

  const DICE_TYPES = [
    { sides: 4, label: 'd4', icon: '▲' },
    { sides: 6, label: 'd6', icon: '■' },
    { sides: 8, label: 'd8', icon: '◆' },
    { sides: 10, label: 'd10', icon: '◈' },
    { sides: 12, label: 'd12', icon: '⬢' },
    { sides: 20, label: 'd20', icon: '⭐' },
    { sides: 100, label: 'd100', icon: '💯' },
  ];

  function addDie(sides: number) {
    diceCounts[sides] = (diceCounts[sides] || 0) + 1;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(15);
    }
  }

  function adjustModifier(delta: number) {
    modifier += delta;
  }

  function clearTray() {
    for (const sides of Object.keys(diceCounts)) {
      diceCounts[Number(sides)] = 0;
    }
    modifier = 0;
    advMode = 'normal';
  }

  // Derived calculated formula expression
  let formula = $derived.by(() => {
    const parts: string[] = [];

    // Collect dice counts
    for (const d of DICE_TYPES) {
      const count = diceCounts[d.sides];
      if (count > 0) {
        if (d.sides === 20 && advMode !== 'normal') {
          // If advantage/disadvantage, roll 2 dice for each single d20
          parts.push(`${count * 2}d20`);
        } else {
          parts.push(`${count}d${d.sides}`);
        }
      }
    }

    // Default to 1d20 (or 2d20 if advantage/disadvantage) if no dice were clicked
    if (parts.length === 0) {
      if (advMode !== 'normal') {
        parts.push('2d20');
      } else {
        parts.push('1d20');
      }
    }

    let expr = parts.join(' + ');

    if (modifier > 0) {
      expr += ` + ${modifier}`;
    } else if (modifier < 0) {
      expr += ` - ${Math.abs(modifier)}`;
    }

    return expr;
  });

  function handleRoll() {
    const cleanExpr = formula.replace(/\s+/g, '');
    const cleanName = characterName.trim() || 'Player Companion';

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([20, 40, 20]);
    }

    // Emit over Companion WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'RollDice',
          expression: cleanExpr,
          character_name: cleanName,
        })
      );
    }

    onRoll?.(cleanExpr);

    // Reset pool back to fresh default state after roll
    clearTray();
  }

  function isCritHit(roll: DiceResultItem): boolean {
    const isD20 = roll.expression.includes('d20');
    if (!isD20) return false;
    // Breakdown matches natural 20
    return (
      roll.breakdown.includes('[20') ||
      roll.breakdown.includes('20]') ||
      roll.breakdown.includes(', 20') ||
      roll.breakdown.includes(' 20 ') ||
      roll.total === 20
    );
  }

  function isCritFumble(roll: DiceResultItem): boolean {
    const isD20 = roll.expression.includes('d20');
    if (!isD20) return false;
    // Breakdown matches natural 1
    return (
      roll.breakdown.includes('[1') ||
      roll.breakdown.includes('1]') ||
      roll.breakdown.includes(', 1') ||
      roll.breakdown === '1'
    );
  }
</script>

<div class="space-y-4">
  <!-- ═════════════════════════════════════════════════════════════════════════
       1. TOUCH DICE TRAY CARD
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <span class="text-base">🎲</span>
        <h3 class="text-xs font-black uppercase tracking-wider text-slate-200">Quick Dice Roller</h3>
      </div>

      <!-- Formula Preview & Clear -->
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-950 border border-slate-800 text-indigo-300">
          {formula}
          {#if advMode === 'adv'}
            <span class="text-[9px] text-emerald-400 font-sans ml-1">(ADV)</span>
          {:else if advMode === 'dis'}
            <span class="text-[9px] text-rose-400 font-sans ml-1">(DIS)</span>
          {/if}
        </span>
        <button
          type="button"
          onclick={clearTray}
          class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors"
          title="Clear dice tray"
          aria-label="Clear dice tray"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- RPG Die Selection Grid -->
    <div class="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {#each DICE_TYPES as d}
        {@const count = diceCounts[d.sides] || 0}
        <button
          type="button"
          onclick={() => addDie(d.sides)}
          class="relative py-2.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 shadow-sm {count > 0
            ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 shadow-indigo-950/60'
            : 'bg-slate-950/70 hover:bg-slate-800/80 active:bg-indigo-600 border-slate-800 text-slate-300'}"
        >
          <span class="text-xs opacity-75">{d.icon}</span>
          <span class="text-xs font-bold font-mono">{d.label}</span>
          {#if count > 0}
            <span class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white font-mono font-black text-[9px] flex items-center justify-center shadow">
              {count}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Modifier & Advantage Row -->
    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 flex-wrap">
      <!-- Modifier Stepper -->
      <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-0.5">
        <button
          type="button"
          onclick={() => adjustModifier(-1)}
          class="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono font-bold text-xs flex items-center justify-center active:scale-95"
        >
          -1
        </button>
        <span class="w-12 text-center text-xs font-mono font-bold {modifier > 0 ? 'text-emerald-400' : modifier < 0 ? 'text-rose-400' : 'text-slate-400'}">
          {modifier >= 0 ? `+${modifier}` : modifier}
        </span>
        <button
          type="button"
          onclick={() => adjustModifier(1)}
          class="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono font-bold text-xs flex items-center justify-center active:scale-95"
        >
          +1
        </button>
      </div>

      <!-- Advantage / Disadvantage Mode Toggle -->
      <div class="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
        <button
          type="button"
          onclick={() => (advMode = 'normal')}
          class="px-2 py-1 rounded-lg transition-colors {advMode === 'normal' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
        >
          Normal
        </button>
        <button
          type="button"
          onclick={() => (advMode = advMode === 'adv' ? 'normal' : 'adv')}
          class="px-2 py-1 rounded-lg transition-colors {advMode === 'adv' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-400/80 hover:text-emerald-300'}"
        >
          ADV
        </button>
        <button
          type="button"
          onclick={() => (advMode = advMode === 'dis' ? 'normal' : 'dis')}
          class="px-2 py-1 rounded-lg transition-colors {advMode === 'dis' ? 'bg-rose-600 text-white shadow-sm' : 'text-rose-400/80 hover:text-rose-300'}"
        >
          DIS
        </button>
      </div>
    </div>

    <!-- Big Touch Roll Trigger -->
    <button
      type="button"
      onclick={handleRoll}
      class="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:from-indigo-700 active:to-indigo-600 text-white font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-indigo-950/70 flex items-center justify-center gap-2"
    >
      <span>🎲</span>
      <span>Roll {formula}</span>
    </button>
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. SCROLLABLE LIVE ROLL HISTORY FEED
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Roll History</span>
      {#if rollHistory.length > 0}
        <button
          type="button"
          onclick={() => (rollHistory = [])}
          class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Clear Feed
        </button>
      {/if}
    </div>

    {#if rollHistory.length === 0}
      <div class="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center space-y-1">
        <span class="text-2xl opacity-60">🎲</span>
        <p class="text-xs text-slate-400 font-semibold">No dice rolls recorded yet</p>
        <p class="text-[10px] text-slate-500">Tap any die above to roll and broadcast to DM workstation</p>
      </div>
    {:else}
      <div class="space-y-2 max-h-56 overflow-y-auto pr-0.5 scrollbar-thin">
        {#each rollHistory as roll (roll.roll_id || `${roll.roller}-${roll.total}-${Math.random()}`)}
          {@const crit = isCritHit(roll)}
          {@const fumble = isCritFumble(roll)}
          <div
            class="p-3 rounded-xl border transition-all animate-in fade-in slide-in-from-bottom-2 {crit
              ? 'bg-amber-950/40 border-amber-400 text-amber-200 shadow-md shadow-amber-950/40'
              : fumble
              ? 'bg-rose-950/40 border-rose-500 text-rose-200 shadow-md shadow-rose-950/40'
              : 'bg-slate-900/80 border-slate-800 text-slate-200'}"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xs font-bold text-slate-100 truncate">{roll.roller}</span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-950/60 border border-slate-800 text-slate-400">
                  {roll.expression}
                </span>
                {#if crit}
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 shadow-sm animate-pulse">
                    NAT 20
                  </span>
                {:else if fumble}
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm">
                    NAT 1
                  </span>
                {/if}
              </div>

              <!-- Total Outcome Number -->
              <span class="text-xl font-black font-mono {crit ? 'text-amber-300' : fumble ? 'text-rose-400' : 'text-indigo-400'}">
                {roll.total}
              </span>
            </div>

            <!-- Breakdown -->
            {#if roll.breakdown}
              <div class="text-[11px] font-mono text-slate-400 mt-1 truncate">
                {roll.breakdown}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
