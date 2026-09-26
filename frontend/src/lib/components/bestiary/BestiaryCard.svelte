<!-- BestiaryCard.svelte — Tactical AboveVTT-Style Monster Statblock Card with Click-to-Roll Parsing -->
<script lang="ts">
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { bestiaryStore } from '../../stores/bestiaryStore.svelte';
  import ClickToRollText from '../combat/ClickToRollText.svelte';

  interface Props {
    monster: CompendiumMonster | any;
    onClose?: () => void;
    onAddToEncounter?: (monster: any) => void;
  }

  let { monster, onClose, onAddToEncounter }: Props = $props();

  function calcMod(score: number): number {
    return Math.floor(((score || 10) - 10) / 2);
  }

  function formatMod(mod: number): string {
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  function rollAbility(stat: string, score: number, type: 'check' | 'save' = 'check', e?: MouseEvent) {
    if (!monster) return;
    const mod = calcMod(score);
    const sign = mod >= 0 ? '+' : '';

    let formula = `1d20${sign}${mod}`;
    let modeSuffix = '';

    if (e?.shiftKey) {
      formula = `2d20kh1${sign}${mod}`;
      modeSuffix = ' (Advantage)';
    } else if (e?.altKey) {
      formula = `2d20kl1${sign}${mod}`;
      modeSuffix = ' (Disadvantage)';
    }

    chatStore.roll(formula, {
      label: `${monster.name}: ${stat.toUpperCase()} ${type === 'save' ? 'Save' : 'Check'}${modeSuffix}`,
      actorName: monster.name,
      actionType: type,
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: stat.toUpperCase(), value: mod },
      ],
    });
  }

  function handleAdd() {
    if (onAddToEncounter) {
      onAddToEncounter(monster);
    } else {
      bestiaryStore.quickAddToEncounter(monster);
    }
  }
</script>

{#if monster}
  <div class="relative bg-amber-50/95 text-stone-900 border-2 border-amber-800/80 rounded-2xl shadow-2xl p-6 font-serif max-w-2xl mx-auto overflow-y-auto max-h-[85vh] scrollbar-thin select-text">
    <!-- Top Action Bar -->
    <div class="flex items-center justify-between border-b-2 border-amber-900/60 pb-3 mb-4 font-sans">
      <button
        type="button"
        onclick={handleAdd}
        class="px-3 py-1 bg-amber-800 hover:bg-amber-700 active:scale-95 text-amber-100 font-bold text-xs rounded-lg shadow transition-all flex items-center gap-1.5"
        title="Add to Current Combat Encounter"
      >
        <span>⚔️</span>
        <span>+ Add to Encounter</span>
      </button>

      {#if onClose}
        <button
          type="button"
          onclick={onClose}
          class="w-7 h-7 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 flex items-center justify-center font-bold text-sm transition-colors"
          aria-label="Close Bestiary Card"
        >
          ✕
        </button>
      {/if}
    </div>

    <!-- Header Block -->
    <div class="space-y-0.5 border-b-2 border-amber-900/40 pb-3">
      <h2 class="text-2xl font-black text-amber-950 tracking-wide font-serif capitalize">
        {monster.name}
      </h2>
      <p class="text-xs italic text-stone-700 font-medium">
        {monster.size || 'Medium'} {monster.type || 'Humanoid'}, {monster.alignment || 'Any Alignment'}
      </p>
    </div>

    <!-- Defenses & Stats -->
    <div class="grid grid-cols-3 gap-2 my-3 text-xs font-sans text-stone-800">
      <div class="bg-amber-100/60 border border-amber-800/20 rounded-lg p-2 text-center">
        <span class="text-[10px] uppercase font-bold text-amber-950 block">Armor Class</span>
        <span class="text-base font-black font-mono text-amber-900">🛡️ {monster.ac}</span>
      </div>
      <div class="bg-amber-100/60 border border-amber-800/20 rounded-lg p-2 text-center">
        <span class="text-[10px] uppercase font-bold text-amber-950 block">Hit Points</span>
        <span class="text-base font-black font-mono text-rose-800">❤️ {monster.hp}</span>
      </div>
      <div class="bg-amber-100/60 border border-amber-800/20 rounded-lg p-2 text-center">
        <span class="text-[10px] uppercase font-bold text-amber-950 block">CR / Speed</span>
        <span class="text-xs font-bold font-mono text-stone-700">CR {monster.cr} · {monster.speed || '30 ft.'}</span>
      </div>
    </div>

    <!-- 6 Ability Scores with Click-to-Roll -->
    <div class="grid grid-cols-6 gap-1.5 my-3 text-center font-sans">
      {#each (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) as ab}
        {@const score = monster[ab] ?? 10}
        {@const mod = calcMod(score)}
        <div class="bg-amber-100/70 border border-amber-800/20 rounded-lg p-1.5 flex flex-col justify-between">
          <span class="text-[9px] uppercase font-bold text-amber-950">{ab}</span>
          <button
            type="button"
            onclick={(e) => rollAbility(ab, score, 'check', e)}
            class="my-0.5 py-0.5 rounded hover:bg-amber-200 active:scale-95 text-amber-950 font-bold font-mono text-xs cursor-pointer transition-colors"
            title="Click: Check | Shift: Adv | Alt: Dis"
          >
            {score} ({formatMod(mod)})
          </button>
          <button
            type="button"
            onclick={(e) => rollAbility(ab, score, 'save', e)}
            class="text-[8px] px-1 py-0.5 rounded bg-amber-800 hover:bg-amber-700 text-amber-100 font-bold uppercase transition-colors"
            title="Roll Saving Throw"
          >
            Save
          </button>
        </div>
      {/each}
    </div>

    <!-- Special Traits -->
    {#if monster.traits && monster.traits.length > 0}
      <div class="mt-4 space-y-2 border-t border-amber-900/40 pt-2">
        <h3 class="font-serif font-black text-sm text-amber-950">Special Traits</h3>
        <div class="space-y-2 text-xs text-stone-800 font-sans">
          {#each monster.traits as trait}
            <div class="leading-relaxed">
              <strong class="text-amber-950 font-bold">{trait.name}.</strong>
              <ClickToRollText text={trait.description} actorName={monster.name} actionName={trait.name} />
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Actions with Click-to-Roll Parsing -->
    {#if monster.actions && monster.actions.length > 0}
      <div class="mt-4 space-y-2.5 border-t border-amber-900/40 pt-2">
        <h3 class="font-serif font-black text-sm text-amber-950">Actions</h3>
        <div class="space-y-2.5 text-xs text-stone-800 font-sans">
          {#each monster.actions as act}
            <div class="p-2.5 bg-amber-100/50 hover:bg-amber-100/80 border border-amber-800/20 rounded-xl transition-colors">
              <div class="font-bold text-amber-950 text-xs mb-1">
                {act.name}
              </div>
              <div class="leading-relaxed text-stone-800 text-[11px]">
                <ClickToRollText text={act.description} actorName={monster.name} actionName={act.name} />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
