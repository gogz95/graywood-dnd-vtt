<!-- src/lib/components/bestiary/StatblockDrawer.svelte -->
<!-- 5e SRD Monster Statblock Side-Sheet Drawer with One-Click Attack & Damage Parsing -->

<script lang="ts">
  import type { CompendiumMonster } from '$lib/db/compendiumDb';
  import { parseMonsterAction, executeMonsterAction, type ParsedAction } from '$lib/services/statblockActionResolver';

  let {
    monster = null,
    isOpen = $bindable(false),
    onClose,
  }: {
    monster: CompendiumMonster | null;
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  function calcMod(score: number): string {
    const mod = Math.floor(((score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  function handleClose() {
    isOpen = false;
    onClose?.();
  }

  async function handleActionClick(actionName: string, actionDesc: string) {
    if (!monster) return;
    const parsed: ParsedAction = parseMonsterAction(actionName, actionDesc);
    await executeMonsterAction(monster.name, parsed);
  }
</script>

{#if isOpen && monster}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in select-none"
    onclick={handleClose}
    onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
  >
    <!-- Slide-over Drawer -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="{monster.name} Statblock"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      class="w-full max-w-md h-full bg-slate-950 border-l border-slate-800 shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right duration-200"
    >
      <!-- Drawer Header -->
      <div class="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div>
          <h2 class="text-base font-black text-amber-400 capitalize">{monster.name}</h2>
          <span class="text-[10px] text-slate-400 capitalize">{monster.size} {monster.type}, {monster.alignment}</span>
        </div>
        <button
          type="button"
          onclick={handleClose}
          aria-label="Close Statblock"
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Statblock Body -->
      <div class="p-5 space-y-4 text-xs">
        <!-- Vitals Box -->
        <div class="grid grid-cols-3 gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-center">
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase block">Armor Class</span>
            <span class="text-sm font-black text-slate-100 font-mono">{monster.ac}</span>
          </div>
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase block">Hit Points</span>
            <span class="text-sm font-black text-rose-400 font-mono">{monster.hp}</span>
          </div>
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase block">Speed</span>
            <span class="text-xs font-bold text-slate-200 font-mono mt-0.5 block">{monster.speed}</span>
          </div>
        </div>

        <!-- Ability Scores Matrix -->
        <div class="grid grid-cols-6 gap-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60 text-center">
          {#each [
            { label: 'STR', val: monster.str },
            { label: 'DEX', val: monster.dex },
            { label: 'CON', val: monster.con },
            { label: 'INT', val: monster.int },
            { label: 'WIS', val: monster.wis },
            { label: 'CHA', val: monster.cha }
          ] as stat}
            <div class="space-y-0.5">
              <span class="text-[8px] font-bold text-slate-500">{stat.label}</span>
              <div class="text-[11px] font-bold text-slate-200">{stat.val}</div>
              <div class="text-[9px] font-mono text-indigo-400">{calcMod(stat.val)}</div>
            </div>
          {/each}
        </div>

        <!-- Meta Stats -->
        <div class="space-y-1 text-[11px] border-y border-slate-800/80 py-2.5 text-slate-300">
          <div><span class="font-bold text-slate-400">Challenge:</span> <span class="font-mono text-amber-300 font-bold">{monster.cr}</span></div>
          <div><span class="font-bold text-slate-400">Sourcebook:</span> <span class="text-slate-200">{monster.sourceBook}</span></div>
        </div>

        <!-- Actions Section with One-Click Resolvers -->
        {#if monster.actions && monster.actions.length > 0}
          <div class="space-y-2 pt-1">
            <h3 class="text-xs font-black text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-1.5 flex items-center justify-between">
              <span>Actions</span>
              <span class="text-[9px] text-indigo-400 font-normal normal-case">Click to roll into chat</span>
            </h3>

            <div class="space-y-2">
              {#each monster.actions as action}
                {@const parsed = parseMonsterAction(action.name, action.description)}
                <div class="p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 rounded-xl transition-all space-y-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-xs text-amber-300">{action.name}</span>

                    <button
                      type="button"
                      onclick={() => handleActionClick(action.name, action.description)}
                      class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-lg shadow transition-colors flex items-center gap-1 shrink-0"
                    >
                      <span>🎲</span>
                      <span>{parsed.toHit !== null ? `${parsed.toHit >= 0 ? '+' : ''}${parsed.toHit} Attack` : 'Use Action'}</span>
                    </button>
                  </div>

                  <p class="text-[11px] text-slate-300 leading-relaxed">{action.description}</p>

                  {#if parsed.damageFormula}
                    <div class="flex items-center gap-2 pt-1">
                      <span class="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-[9px] font-bold">
                        {parsed.damageFormula} {parsed.damageType || ''}
                      </span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
