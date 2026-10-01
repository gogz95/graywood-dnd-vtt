<!-- frontend/src/lib/components/combat/RestModal.svelte -->
<!-- 5e SRD Short & Long Rest Automation Modal with Hit Dice Expenditure & Resource Recovery -->

<script lang="ts">
  import {
    characterStore,
    spellSlotsStore,
    classResourcesStore,
    exhaustionStore,
    executeShortRest,
    executeLongRest,
  } from '$lib/stores/characterStore';

  let {
    isOpen = false,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let restType = $state<'short' | 'long'>('short');

  // Short rest state
  let diceToSpend = $state(1);
  let rolledValues = $state<number[]>([]);
  let isRolling = $state(false);
  let isExecuting = $state(false);

  let character = $derived($characterStore);
  let currentHp = $derived(character?.current_hp ?? 0);
  let maxHp = $derived(character?.max_hp ?? 1);
  let currentHd = $derived(character?.hit_dice_current ?? 0);
  let maxHd = $derived(character?.hit_dice_max ?? 1);

  // Parse Constitution modifier from character stats (default +2 if unparsed)
  let conMod = $derived.by(() => {
    if (!character) return 0;
    const conScore = (character as any).constitution ?? (character as any).con ?? 14;
    return Math.floor((conScore - 10) / 2);
  });

  // Determine hit die size (d6, d8, d10, d12) based on class
  let hitDieSize = $derived.by(() => {
    if (!character) return 8;
    const cls = ((character as any).class_name || (character as any).class || '').toLowerCase();
    if (cls.includes('barbarian')) return 12;
    if (cls.includes('fighter') || cls.includes('paladin') || cls.includes('ranger')) return 10;
    if (cls.includes('sorcerer') || cls.includes('wizard')) return 6;
    return 8; // Cleric, Druid, Monk, Rogue, Warlock, Bard
  });

  // Calculate potential healing
  let totalRolledHp = $derived(rolledValues.reduce((sum, v) => sum + v, 0));
  let totalHealedWithCon = $derived(Math.max(0, totalRolledHp + rolledValues.length * conMod));
  let projectedHpShort = $derived(Math.min(maxHp, currentHp + totalHealedWithCon));

  // Long rest projections
  let longRestHdRegained = $derived(Math.max(1, Math.floor(maxHd / 2)));
  let projectedHdLong = $derived(Math.min(maxHd, currentHd + longRestHdRegained));
  let currentExhaustion = $derived($exhaustionStore);
  let projectedExhaustionLong = $derived(Math.max(0, currentExhaustion - 1));

  function rollHitDice() {
    isRolling = true;
    const count = Math.min(diceToSpend, currentHd);
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * hitDieSize) + 1);
    }
    rolledValues = rolls;
    isRolling = false;
  }

  async function handleConfirmShortRest() {
    if (isExecuting) return;
    isExecuting = true;
    try {
      const diceCount = rolledValues.length > 0 ? rolledValues.length : Math.min(diceToSpend, currentHd);
      const hpRecovered = rolledValues.length > 0
        ? totalHealedWithCon
        : diceCount * (Math.floor(hitDieSize / 2) + 1 + conMod);

      await executeShortRest(Math.max(0, hpRecovered), diceCount, true);
      onClose();
    } catch (err) {
      console.error('[RestModal] Failed to execute short rest:', err);
    } finally {
      isExecuting = false;
    }
  }

  async function handleConfirmLongRest() {
    if (isExecuting) return;
    isExecuting = true;
    try {
      await executeLongRest();
      onClose();
    } catch (err) {
      console.error('[RestModal] Failed to execute long rest:', err);
    } finally {
      isExecuting = false;
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    role="dialog"
    aria-modal="true"
    aria-labelledby="rest-modal-title"
  >
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-2">
          <span class="text-xl">⛺</span>
          <h2 id="rest-modal-title" class="font-bold text-sm text-slate-100 uppercase tracking-wider">
            Party Rest & Recovery
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="text-slate-400 hover:text-slate-200 transition-colors text-lg"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="grid grid-cols-2 p-1.5 bg-slate-950/40 border-b border-slate-800 text-xs font-semibold">
        <button
          type="button"
          class="py-2 rounded-lg transition-all {restType === 'short' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50 shadow' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => { restType = 'short'; }}
        >
          🌿 Short Rest (1 Hour)
        </button>
        <button
          type="button"
          class="py-2 rounded-lg transition-all {restType === 'long' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => { restType = 'long'; }}
        >
          ✨ Long Rest (8 Hours)
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 space-y-4 text-xs text-slate-300">
        {#if restType === 'short'}
          <!-- Short Rest Details -->
          <div class="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/60 space-y-2">
            <div class="flex justify-between items-center text-slate-400">
              <span>Hit Dice Available:</span>
              <span class="font-mono font-bold text-amber-400 text-sm">{currentHd} / {maxHd} (d{hitDieSize})</span>
            </div>
            <div class="flex justify-between items-center text-slate-400">
              <span>Constitution Mod:</span>
              <span class="font-mono text-slate-200">{conMod >= 0 ? `+${conMod}` : conMod} per die</span>
            </div>
            <div class="flex justify-between items-center text-slate-400">
              <span>Current HP:</span>
              <span class="font-mono text-slate-200">{currentHp} / {maxHp}</span>
            </div>
          </div>

          <!-- Dice Spend Input & Roller -->
          {#if currentHd > 0}
            <div class="space-y-2">
              <label for="hd-spend-range" class="block font-semibold text-slate-300 text-[11px]">
                Spend Hit Dice: <span class="text-amber-400 font-mono font-bold">{diceToSpend}d{hitDieSize}</span>
              </label>
              <div class="flex items-center gap-3">
                <input
                  id="hd-spend-range"
                  type="range"
                  min="1"
                  max={Math.max(1, currentHd)}
                  bind:value={diceToSpend}
                  class="flex-1 accent-amber-500"
                />
                <button
                  type="button"
                  onclick={rollHitDice}
                  disabled={isRolling}
                  class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                >
                  🎲 Roll
                </button>
              </div>

              {#if rolledValues.length > 0}
                <div class="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
                  <div class="flex justify-between items-center text-[11px] text-amber-200">
                    <span>Rolls: [{rolledValues.join(', ')}] + {rolledValues.length * conMod} CON</span>
                    <span class="font-bold text-sm text-amber-400">+{totalHealedWithCon} HP</span>
                  </div>
                  <div class="text-[10px] text-amber-300/80">
                    Projected HP: {projectedHpShort} / {maxHp} ({Math.max(0, currentHd - rolledValues.length)} HD left)
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg text-rose-300 text-center">
              No Hit Dice remaining! Complete a Long Rest to regain Hit Dice.
            </div>
          {/if}

          <!-- Automatic Resource Recharge Notice -->
          <div class="border-t border-slate-800 pt-3 space-y-1 text-[11px] text-slate-400">
            <div class="font-semibold text-slate-300 mb-1">⚡ Automatic Short Rest Recharges:</div>
            <ul class="list-disc list-inside space-y-0.5 text-slate-400 text-[10px]">
              <li><strong class="text-indigo-400">Warlock:</strong> All Pact Magic spell slots reset</li>
              <li><strong class="text-amber-400">Fighter:</strong> Action Surge & Second Wind reset</li>
              <li><strong class="text-emerald-400">Monk:</strong> Ki Points restored to maximum</li>
              <li>All custom short-rest class features reset</li>
            </ul>
          </div>
        {:else}
          <!-- Long Rest Details -->
          <div class="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/60 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-slate-400">HP Recovery:</span>
              <span class="font-mono font-bold text-emerald-400">Full ({maxHp} HP)</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Hit Dice Regained:</span>
              <span class="font-mono font-bold text-indigo-400">+{longRestHdRegained} ({projectedHdLong} / {maxHd})</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Spell Slots:</span>
              <span class="font-mono font-bold text-indigo-300">All Slots Restored</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Exhaustion Level:</span>
              <span class="font-mono font-bold {currentExhaustion > 0 ? 'text-amber-400' : 'text-slate-300'}">
                {currentExhaustion} → {projectedExhaustionLong}
              </span>
            </div>
          </div>

          <div class="border-t border-slate-800 pt-2 text-[11px] text-slate-400 leading-relaxed">
            Completing an 8-hour Long Rest restores all hit points, resets all expended spell slots and class features, clears temporary hit points, and restores up to half your total Hit Dice (minimum 1).
          </div>
        {/if}
      </div>

      <!-- Footer Buttons -->
      <div class="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex justify-end gap-2.5">
        <button
          type="button"
          onclick={onClose}
          class="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-xs font-semibold"
        >
          Cancel
        </button>
        {#if restType === 'short'}
          <button
            type="button"
            onclick={handleConfirmShortRest}
            disabled={isExecuting}
            class="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold transition-colors text-xs shadow"
          >
            {isExecuting ? 'Resting...' : 'Take Short Rest'}
          </button>
        {:else}
          <button
            type="button"
            onclick={handleConfirmLongRest}
            disabled={isExecuting}
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition-colors text-xs shadow"
          >
            {isExecuting ? 'Resting...' : 'Take Long Rest'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
