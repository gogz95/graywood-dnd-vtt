<!-- src/lib/components/bestiary/StatblockView.svelte -->
<!-- Authentic 5e SRD Responsive Parchment-Style Monster Statblock View -->

<script lang="ts">
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { bestiaryStore } from '../../stores/bestiaryStore.svelte';

  let {
    monster,
    onClose,
    onAddToEncounter
  }: {
    monster: CompendiumMonster | any;
    onClose?: () => void;
    onAddToEncounter?: (monster: any) => void;
  } = $props();

  function calcMod(score: number): string {
    const mod = Math.floor(((score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  function getCrXp(cr: number): string {
    const xpTable: Record<string, string> = {
      '0': '10 XP',
      '0.125': '25 XP',
      '0.25': '50 XP',
      '0.5': '100 XP',
      '1': '200 XP',
      '2': '450 XP',
      '3': '700 XP',
      '4': '1,100 XP',
      '5': '1,800 XP',
      '6': '2,300 XP',
      '7': '2,900 XP',
      '8': '3,900 XP',
      '9': '5,000 XP',
      '10': '5,900 XP',
      '11': '7,200 XP',
      '12': '8,400 XP',
      '13': '10,000 XP',
      '14': '11,500 XP',
      '15': '13,000 XP',
      '16': '15,000 XP',
      '17': '18,000 XP',
      '18': '20,000 XP',
      '19': '22,000 XP',
      '20': '25,000 XP',
      '21': '33,000 XP',
      '22': '41,000 XP',
      '23': '50,000 XP',
      '24': '62,000 XP',
      '30': '155,000 XP',
    };
    const key = cr.toString();
    return xpTable[key] || `${Math.max(10, Math.floor(cr * 200))} XP`;
  }

  function formatCr(cr: number): string {
    if (cr === 0.125) return '1/8';
    if (cr === 0.25) return '1/4';
    if (cr === 0.5) return '1/2';
    return cr.toString();
  }

  // Sections collapse state
  let showTraits = $state(true);
  let showActions = $state(true);
  let showBonusActions = $state(true);
  let showReactions = $state(true);
  let showLegendary = $state(true);

  function executeAction(act: { name: string; description: string }) {
    if (!monster) return;

    // Check if attack roll exists e.g. "+4 to hit"
    const hitMatch = act.description.match(/([+-]\d+)\s*to\s*hit/i);
    // Check if damage roll exists e.g. "Hit: 1d6 + 2" or "Hit: 7 (2d6)"
    const dmgMatch = act.description.match(/Hit:\s*(?:(\d+)\s*\(([^)]+)\)|(\d*d\d+(?:\s*[+-]\s*\d+)?))/i);

    if (hitMatch) {
      const bonus = parseInt(hitMatch[1], 10);
      const formula = bonus >= 0 ? `1d20 + ${bonus}` : `1d20 - ${Math.abs(bonus)}`;

      chatStore.roll(formula, {
        label: `${monster.name} - ${act.name} (Attack)`,
        actorName: monster.name,
        actionType: 'attack'
      });
    }

    if (dmgMatch) {
      const formula = dmgMatch[2] || dmgMatch[3];
      if (formula && formula.includes('d')) {
        chatStore.roll(formula.trim(), {
          label: `${monster.name} - ${act.name} (Damage)`,
          actorName: monster.name,
          actionType: 'damage'
        });
      }
    }

    // Send action narrative card to chat
    chatStore.postMessage({
      sender: monster.name,
      channel: 'public',
      text: `**${act.name}**: ${act.description}`
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
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handleAdd}
          class="px-3 py-1 bg-amber-800 hover:bg-amber-700 active:scale-95 text-amber-100 font-bold text-xs rounded-lg shadow transition-all flex items-center gap-1.5"
          title="Add to Current Combat Encounter"
        >
          <span>⚔️</span>
          <span>+ Add to Encounter</span>
        </button>
      </div>

      {#if onClose}
        <button
          type="button"
          onclick={onClose}
          class="w-7 h-7 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 flex items-center justify-center font-bold text-sm transition-colors"
          aria-label="Close Statblock"
        >
          ✕
        </button>
      {/if}
    </div>

    <!-- Header Block -->
    <div class="space-y-0.5 border-b-2 border-amber-900/40 pb-3">
      <h1 class="text-2xl font-black text-amber-950 tracking-wide font-serif capitalize">
        {monster.name}
      </h1>
      <p class="text-xs italic text-stone-700 font-medium">
        {monster.size || 'Medium'} {monster.type || 'Humanoid'}, {monster.alignment || 'Any Alignment'}
      </p>
    </div>

    <!-- Taper Line -->
    <div class="h-0.5 bg-gradient-to-r from-amber-900 via-amber-600 to-transparent my-3"></div>

    <!-- Defenses Block -->
    <div class="text-xs space-y-1 text-stone-800 font-sans leading-relaxed">
      <div>
        <strong class="text-amber-950 font-bold">Armor Class:</strong>
        <span class="font-mono font-bold ml-1">{monster.ac || 10}</span>
      </div>
      <div>
        <strong class="text-amber-950 font-bold">Hit Points:</strong>
        <span class="font-mono font-bold ml-1">{monster.hp || 10}</span>
        {#if monster.hit_dice}
          <span class="text-stone-600 font-mono text-[11px] ml-1">({monster.hit_dice})</span>
        {/if}
      </div>
      <div>
        <strong class="text-amber-950 font-bold">Speed:</strong>
        <span class="ml-1">{monster.speed || '30 ft.'}</span>
      </div>
    </div>

    <!-- Taper Line -->
    <div class="h-0.5 bg-gradient-to-r from-amber-900 via-amber-600 to-transparent my-3"></div>

    <!-- Ability Scores Matrix -->
    <div class="grid grid-cols-6 gap-2 text-center py-1 border-b-2 border-amber-900/40 font-sans">
      {#each [
        { label: 'STR', val: monster.str ?? 10 },
        { label: 'DEX', val: monster.dex ?? 10 },
        { label: 'CON', val: monster.con ?? 10 },
        { label: 'INT', val: monster.int ?? 10 },
        { label: 'WIS', val: monster.wis ?? 10 },
        { label: 'CHA', val: monster.cha ?? 10 }
      ] as stat}
        <div class="bg-amber-100/60 rounded-lg p-1 border border-amber-850/20">
          <span class="block text-[10px] font-black uppercase text-amber-950">{stat.label}</span>
          <span class="block text-sm font-black text-stone-900">{stat.val}</span>
          <span class="block text-[10px] font-bold text-stone-600 font-mono">({calcMod(stat.val)})</span>
        </div>
      {/each}
    </div>

    <!-- Senses, Languages, CR -->
    <div class="text-xs space-y-1 text-stone-800 font-sans py-3 border-b-2 border-amber-900/40">
      <div>
        <strong class="text-amber-950 font-bold">Challenge:</strong>
        <span class="font-mono font-bold ml-1">{formatCr(monster.cr)}</span>
        <span class="text-stone-600 ml-1">({getCrXp(monster.cr)})</span>
      </div>
      {#if monster.sourceBook}
        <div>
          <strong class="text-amber-950 font-bold">Source:</strong>
          <span class="ml-1 italic text-stone-700">{monster.sourceBook}</span>
        </div>
      {/if}
    </div>

    <!-- Traits Block (if any) -->
    {#if monster.traits && monster.traits.length > 0}
      <div class="mt-4 space-y-2">
        <button
          type="button"
          onclick={() => showTraits = !showTraits}
          class="w-full text-left font-serif font-black text-base text-amber-950 border-b border-amber-900/40 pb-1 flex items-center justify-between"
        >
          <span>Special Traits</span>
          <span class="text-xs">{showTraits ? '▼' : '▶'}</span>
        </button>
        {#if showTraits}
          <div class="space-y-2 text-xs text-stone-800 font-sans">
            {#each monster.traits as trait}
              <div>
                <strong class="text-amber-950 font-bold">{trait.name}.</strong>
                <span class="leading-relaxed">{trait.description}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Actions Block -->
    {#if monster.actions && monster.actions.length > 0}
      <div class="mt-5 space-y-2.5">
        <button
          type="button"
          onclick={() => showActions = !showActions}
          class="w-full text-left font-serif font-black text-base text-amber-950 border-b border-amber-900/40 pb-1 flex items-center justify-between"
        >
          <span>Actions ({monster.actions.length})</span>
          <span class="text-xs">{showActions ? '▼' : '▶'}</span>
        </button>
        {#if showActions}
          <div class="space-y-3 text-xs text-stone-800 font-sans">
            {#each monster.actions as act}
              <div class="p-2.5 bg-amber-100/50 hover:bg-amber-100 border border-amber-800/20 rounded-xl transition-colors">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <strong class="text-amber-950 font-bold text-xs">{act.name}</strong>
                  <button
                    type="button"
                    onclick={() => executeAction(act)}
                    class="px-2 py-0.5 bg-amber-800 hover:bg-amber-700 active:scale-95 text-amber-100 font-bold text-[10px] rounded shadow-xs transition-all"
                    title="Roll & Post to Chat"
                  >
                    🎲 Roll Action
                  </button>
                </div>
                <p class="leading-relaxed text-stone-800 text-[11px]">{act.description}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

  </div>
{/if}
