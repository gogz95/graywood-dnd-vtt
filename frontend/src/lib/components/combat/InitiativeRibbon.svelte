<!-- src/lib/components/combat/InitiativeRibbon.svelte -->
<!-- Tactical Combat Initiative Ribbon: Displays sorted combatants, turn pointer, round tracker, and turn progression -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { combatTurnStore, type CombatTurnSync } from '../../../stores/websocketStore';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';

  import { automationSettings } from '../../stores/automationSettings.svelte';
  import { physicalDiceService } from '../../services/physicalDiceService.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';
  import TurnTimerWidget from './TurnTimerWidget.svelte';
  import type { ActiveCombatant, SavedEncounter } from '../../../types/combat';

  let {
    isDm = true,
    compact = false
  }: {
    isDm?: boolean;
    compact?: boolean;
  } = $props();

  let liveCombat = $derived($combatTurnStore);

  async function handleNextTurn() {
    if (!liveCombat || !liveCombat.combatants || liveCombat.combatants.length === 0) {
      sessionStore.nextCombatTurn();
      audioEngine.triggerSfx('sfx-sword');
      return;
    }

    // 1. Inspect the combatant whose turn is expiring:
    const activeIdx = liveCombat.current_turn_index % liveCombat.combatants.length;
    const expiringCombatant = liveCombat.combatants[activeIdx];

    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem('vtt_encounters');
      if (raw) encounters = JSON.parse(raw);
    } catch {}

    const encIds = Object.keys(encounters);
    if (encIds.length > 0 && encounters[encIds[0]] && expiringCombatant) {
      const enc = encounters[encIds[0]];
      const fullExpiring = enc.combatants.find(c => c.id === expiringCombatant.id);
      if (fullExpiring && fullExpiring.conditions) {
        fullExpiring.conditions = fullExpiring.conditions
          .map(c => {
            const match = c.match(/\((\d+)\s*(?:rnd|round|turns?)?\)/i);
            if (match) {
              const count = parseInt(match[1], 10) - 1;
              if (count <= 0) return null; // remove expired condition
              return c.replace(/\(\d+\s*(?:rnd|round|turns?)?\)/i, `(${count} rnd)`);
            }
            return c;
          })
          .filter(Boolean) as string[];
        try {
          localStorage.setItem('vtt_encounters', JSON.stringify(encounters));
        } catch {}
      }
    }

    // Advance turn
    sessionStore.nextCombatTurn();
    audioEngine.triggerSfx('sfx-sword');

    // 2. Inspect the new active combatant:
    const newIdx = (activeIdx + 1) % liveCombat.combatants.length;
    const newActive = liveCombat.combatants[newIdx];

    try {
      const raw = localStorage.getItem('vtt_encounters');
      if (raw) encounters = JSON.parse(raw);
    } catch {}

    let fullNewActive: ActiveCombatant | undefined;
    if (encIds.length > 0 && encounters[encIds[0]] && newActive) {
      fullNewActive = encounters[encIds[0]].combatants.find(c => c.id === newActive.id);
    }

    const currentHp = fullNewActive ? fullNewActive.hp_current : (newActive?.hp_percent === 0 ? 0 : 1);
    const isDying = (fullNewActive?.conditions?.some(c => c.toLowerCase().includes('dying')) ?? false) || currentHp <= 0;

    if (currentHp <= 0 || isDying) {
      const charName = fullNewActive?.name || newActive?.name || 'Combatant';
      const autoRoll = automationSettings.shouldAutoRoll('autoRollDeathSaves');
      let roll: number;

      if (autoRoll) {
        roll = Math.floor(Math.random() * 20) + 1;
      } else {
        roll = await physicalDiceService.promptManualRoll({
          title: 'Death Saving Throw',
          formula: '1d20',
          actorName: charName,
          actionType: 'save'
        });
      }

      if (fullNewActive) {
        if (!fullNewActive.death_saves) {
          fullNewActive.death_saves = { successes: 0, failures: 0 };
        }

        if (roll === 20) {
          fullNewActive.hp_current = 1;
          fullNewActive.death_saves.successes = 0;
          fullNewActive.death_saves.failures = 0;
          fullNewActive.death_saves.isStable = true;
          fullNewActive.conditions = fullNewActive.conditions.filter(c => !c.toLowerCase().includes('dying'));
          chatStore.sendMessage(`⭐ **${charName}** rolled a NATURAL 20 on a Death Saving Throw! Regains 1 HP and rises!`, 'System');
          audioEngine.triggerSfx('sfx-critical');
        } else if (roll === 1) {
          fullNewActive.death_saves.failures = Math.min(3, fullNewActive.death_saves.failures + 2);
          chatStore.sendMessage(`💀 **${charName}** rolled a NATURAL 1 on a Death Saving Throw! (2 Failures: ${fullNewActive.death_saves.failures}/3)`, 'System');
          if (fullNewActive.death_saves.failures >= 3) {
            fullNewActive.death_saves.isDead = true;
            if (!fullNewActive.conditions.includes('Dead')) fullNewActive.conditions.push('Dead');
            chatStore.sendMessage(`💀 **${charName}** has fallen.`, 'System');
          }
        } else if (roll >= 10) {
          fullNewActive.death_saves.successes = Math.min(3, fullNewActive.death_saves.successes + 1);
          chatStore.sendMessage(`🛡️ **${charName}** succeeded on a Death Saving Throw (${roll})! (${fullNewActive.death_saves.successes}/3 Successes)`, 'System');
          if (fullNewActive.death_saves.successes >= 3) {
            fullNewActive.death_saves.isStable = true;
            fullNewActive.conditions = fullNewActive.conditions.filter(c => !c.toLowerCase().includes('dying'));
            if (!fullNewActive.conditions.includes('Stable')) fullNewActive.conditions.push('Stable');
            chatStore.sendMessage(`🛡️ **${charName}** has stabilized!`, 'System');
          }
        } else {
          fullNewActive.death_saves.failures = Math.min(3, fullNewActive.death_saves.failures + 1);
          chatStore.sendMessage(`⚠️ **${charName}** failed a Death Saving Throw (${roll})! (${fullNewActive.death_saves.failures}/3 Failures)`, 'System');
          if (fullNewActive.death_saves.failures >= 3) {
            fullNewActive.death_saves.isDead = true;
            if (!fullNewActive.conditions.includes('Dead')) fullNewActive.conditions.push('Dead');
            chatStore.sendMessage(`💀 **${charName}** has fallen.`, 'System');
          }
        }

        try {
          localStorage.setItem('vtt_encounters', JSON.stringify(encounters));
          sessionStore.broadcastActiveCombat();
        } catch {}
      }
    }
  }

  function handlePrevTurn() {
    sessionStore.prevCombatTurn();
    audioEngine.triggerSfx('sfx-click');
  }
</script>

{#if liveCombat && liveCombat.combatants && liveCombat.combatants.length > 0}
  {@const activeIdx = liveCombat.current_turn_index % liveCombat.combatants.length}
  {@const activeCombatant = liveCombat.combatants[activeIdx]}

  <div
    class="w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3 text-xs select-none shadow-xl z-20"
  >
    <!-- Left: Round Counter & Controls -->
    <div class="flex items-center gap-2 shrink-0">
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 font-mono font-black text-xs shadow-sm">
        <span>⚔️</span>
        <span>RND {liveCombat.round}</span>
      </div>

      {#if isDm}
        <div class="flex items-center gap-1">
          <button
            type="button"
            onclick={handlePrevTurn}
            class="px-2 py-1 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-lg text-slate-300 font-bold transition-all"
            title="Step Back to Previous Turn"
          >
            ◀
          </button>
          <button
            type="button"
            onclick={handleNextTurn}
            class="px-3 py-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-black rounded-lg shadow-md shadow-amber-600/30 transition-all flex items-center gap-1"
            title="Advance to Next Turn (ticks condition timers)"
          >
            <span>NEXT TURN</span>
            <span>▶</span>
          </button>
        </div>
      {/if}

      <!-- Turn Duration Countdown Timer -->
      <TurnTimerWidget
        activeCombatantId={activeCombatant?.id || `${liveCombat.round}-${activeIdx}`}
        {isDm}
        onTimeout={handleNextTurn}
      />
    </div>

    <!-- Center: Horizontal Initiative Strip -->
    <div class="flex-1 flex items-center gap-2 overflow-x-auto py-1 px-2 scrollbar-thin">
      {#each liveCombat.combatants as combatant, idx}
        {@const isActive = idx === activeIdx}
        {@const isOnDeck = idx === (activeIdx + 1) % liveCombat.combatants.length}

        <div
          class="flex items-center gap-2 px-3 py-1 rounded-xl border transition-all shrink-0 {isActive
            ? 'bg-amber-950/80 border-amber-500 text-amber-100 shadow-md shadow-amber-500/20 scale-105 animate-pulse'
            : isOnDeck
            ? 'bg-indigo-950/40 border-indigo-600/40 text-slate-300'
            : 'bg-slate-900/60 border-slate-800/80 text-slate-400 opacity-75'}"
        >
          <!-- Initiative Number Pip -->
          <span
            class="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] {isActive
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-950 text-slate-400 border border-slate-800'}"
          >
            {combatant.initiative}
          </span>

          <!-- Name & Tag -->
          <div class="flex items-center gap-1">
            <span class="font-bold text-xs truncate max-w-[110px]">
              {combatant.is_hidden && !isDm ? 'Unknown Threat' : combatant.name}
            </span>
            {#if isActive}
              <span class="px-1 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[8px] uppercase">
                ACTIVE
              </span>
            {:else if isOnDeck}
              <span class="px-1 py-0.2 rounded bg-indigo-800/60 text-indigo-200 font-bold text-[8px] uppercase">
                ON DECK
              </span>
            {/if}
          </div>

          <!-- HP Indicator -->
          {#if combatant.hp_percent !== undefined}
            <div class="w-8 h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div
                class="h-full transition-all {combatant.hp_percent <= 25 ? 'bg-rose-500' : combatant.hp_percent <= 50 ? 'bg-amber-500' : 'bg-emerald-500'}"
                style="width: {combatant.hp_percent}%"
              ></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Right: Active Creature Summary -->
    {#if activeCombatant}
      <div class="hidden md:flex items-center gap-2 shrink-0 border-l border-slate-800 pl-3">
        <span class="text-[10px] uppercase font-bold text-slate-500">Current:</span>
        <span class="font-black text-amber-300 text-xs truncate max-w-[130px]">
          {activeCombatant.name}
        </span>
      </div>
    {/if}
  </div>
{/if}
