<!-- ManaRecoveryModal.svelte — Mana Potion Slot Recovery Engine for /play and character sheets -->
<script lang="ts">
  import { audioEngine } from '../../audio/AudioEngine';
  import { sendWsEvent } from '../../../stores/websocketStore';

  export interface SpellSlot {
    level: number;
    total: number;
    used: number;
  }

  let {
    isOpen = $bindable(false),
    characterId = '',
    characterName = 'Player',
    spellSlots = $bindable<SpellSlot[]>([]),
    onClose,
  }: {
    isOpen: boolean;
    characterId?: string;
    characterName?: string;
    spellSlots: SpellSlot[];
    onClose?: () => void;
  } = $props();

  export type ManaTier = 'common' | 'greater' | 'superior';

  interface ManaTierDef {
    id: ManaTier;
    label: string;
    formula: string;
    diceCount: number;
    dieSize: number;
    bonus: number;
    rarityBadge: string;
    color: string;
  }

  const MANA_TIERS: ManaTierDef[] = [
    {
      id: 'common',
      label: 'Common Mana Potion',
      formula: '1d4+1',
      diceCount: 1,
      dieSize: 4,
      bonus: 1,
      rarityBadge: 'Common',
      color: 'from-blue-600 to-cyan-600',
    },
    {
      id: 'greater',
      label: 'Greater Mana Potion',
      formula: '2d4+2',
      diceCount: 2,
      dieSize: 4,
      bonus: 2,
      rarityBadge: 'Uncommon',
      color: 'from-indigo-600 to-blue-600',
    },
    {
      id: 'superior',
      label: 'Superior Mana Potion',
      formula: '3d4+4',
      diceCount: 3,
      dieSize: 4,
      bonus: 4,
      rarityBadge: 'Rare',
      color: 'from-purple-600 to-indigo-600',
    },
  ];

  let selectedTier = $state<ManaTier>('greater');
  let manaPool = $state<number>(0);
  let hasRolled = $state<boolean>(false);
  let rollBreakdown = $state<string>('');

  function rollPotion() {
    const tier = MANA_TIERS.find(t => t.id === selectedTier) || MANA_TIERS[0];
    const rolls: number[] = [];
    let sum = 0;
    for (let i = 0; i < tier.diceCount; i++) {
      const r = Math.floor(Math.random() * tier.dieSize) + 1;
      rolls.push(r);
      sum += r;
    }
    const total = sum + tier.bonus;
    manaPool = total;
    hasRolled = true;
    rollBreakdown = `[${rolls.join(' + ')}] + ${tier.bonus} = ${total} pts`;

    audioEngine.triggerSfx('sfx-spell');

    // Broadcast roll to DM log
    sendWsEvent({
      type: 'DICE_ROLL',
      character_id: characterId,
      character_name: characterName,
      formula: `${tier.label} (${tier.formula})`,
      result: total,
      is_critical: false,
      breakdown: rollBreakdown,
    });
  }

  function restoreSlot(levelIdx: number) {
    const slot = spellSlots[levelIdx];
    if (!slot) return;
    const cost = slot.level;

    if (slot.used > 0 && manaPool >= cost) {
      slot.used -= 1;
      manaPool -= cost;
      audioEngine.triggerSfx('sfx-secret');
    }
  }

  function resetModal() {
    manaPool = 0;
    hasRolled = false;
    rollBreakdown = '';
    onClose?.();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">
            🧪
          </div>
          <div>
            <h2 class="text-sm font-black text-slate-100 uppercase tracking-wide">Mana Potion Recovery</h2>
            <p class="text-[10px] text-slate-400">Restore expended spell slots (1 pt per slot level)</p>
          </div>
        </div>
        <button
          onclick={resetModal}
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 space-y-5 overflow-y-auto flex-1">

        <!-- Tier Selector -->
        {#if !hasRolled}
          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Potion Tier</span>
            <div class="grid grid-cols-3 gap-2">
              {#each MANA_TIERS as tier}
                <button
                  type="button"
                  onclick={() => selectedTier = tier.id}
                  class="p-3 rounded-2xl border text-left transition-all flex flex-col justify-between {selectedTier === tier.id
                    ? 'border-cyan-500 bg-cyan-950/30 shadow-lg shadow-cyan-950/40'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}"
                >
                  <span class="text-[9px] font-bold uppercase text-cyan-400">{tier.rarityBadge}</span>
                  <span class="text-xs font-black text-slate-100 mt-1">{tier.formula}</span>
                  <span class="text-[10px] text-slate-400 truncate">{tier.label.split(' ')[0]}</span>
                </button>
              {/each}
            </div>

            <button
              onclick={rollPotion}
              class="w-full mt-3 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wide shadow-xl shadow-cyan-950/50 flex items-center justify-center gap-2"
            >
              <span>🧪 Drink Potion &amp; Roll Mana</span>
            </button>
          </div>
        {:else}
          <!-- Mana Pool HUD -->
          <div class="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/70 to-blue-950/70 border border-cyan-500/30 flex items-center justify-between">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Available Mana Points</span>
              <span class="text-2xl font-black font-mono text-cyan-200">{manaPool} PTS</span>
              <span class="text-[10px] text-slate-400 block font-mono mt-0.5">{rollBreakdown}</span>
            </div>
            <button
              onclick={() => { hasRolled = false; manaPool = 0; }}
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
            >
              Change Tier
            </button>
          </div>

          <!-- Slot Distributor -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Restore Expended Slots</span>
              <span class="text-[10px] text-cyan-400 font-mono">1 pt = 1st level, 2 pts = 2nd level...</span>
            </div>

            <div class="space-y-2">
              {#each spellSlots as slot, idx}
                {#if slot.total > 0}
                  {@const cost = slot.level}
                  {@const canRestore = slot.used > 0 && manaPool >= cost}
                  <div class="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-950/80">
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-xs font-mono font-bold text-indigo-200">
                        {slot.level}
                      </span>
                      <div>
                        <span class="text-xs font-bold text-slate-200">Level {slot.level}</span>
                        <span class="text-[10px] text-slate-500 ml-1.5 font-mono">
                          {slot.total - slot.used} / {slot.total} remaining
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-mono text-slate-400">Cost: {cost} pt{cost > 1 ? 's' : ''}</span>
                      <button
                        onclick={() => restoreSlot(idx)}
                        disabled={!canRestore}
                        class="px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-30 {canRestore
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-600/30'
                          : 'bg-slate-800 text-slate-500'}"
                      >
                        Restore (+1)
                      </button>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
        <button
          onclick={resetModal}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
        >
          Done
        </button>
      </div>

    </div>
  </div>
{/if}
