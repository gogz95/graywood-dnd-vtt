<!-- src/lib/components/combat/MonsterStatBlockModal.svelte -->
<!-- Tactical 5e Monster Stat Block Modal with Click-to-Roll Actions (Attacks, Damage, DCs, Skills, Abilities) -->

<script lang="ts">
  import { chatStore } from '../../stores/chatStore.svelte';
  import type { CompendiumMonster } from '../../db/compendiumDb';
  import { compendiumStore } from '../../stores/compendiumStore.svelte';
  import ClickToRollText from './ClickToRollText.svelte';

  let {
    isOpen = $bindable(false),
    monster = null,
    monsterName = ''
  }: {
    isOpen: boolean;
    monster?: CompendiumMonster | null;
    monsterName?: string;
  } = $props();

  let activeMonster = $derived<CompendiumMonster | null>((() => {
    if (monster) return monster;
    if (monsterName) {
      const match = compendiumStore.searchMonsters(monsterName);
      if (match.length > 0) return match[0];
    }
    return null;
  })());

  function getMod(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  function rollAbility(stat: string, score: number, type: 'check' | 'save' = 'check') {
    if (!activeMonster) return;
    const mod = getMod(score);
    const sign = mod >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${mod}`, {
      label: `${activeMonster.name} ${stat.toUpperCase()} ${type === 'save' ? 'Save' : 'Check'}`,
      actorName: activeMonster.name,
      actionType: type,
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: `${stat.toUpperCase()}`, value: mod },
      ]
    });
  }

  function rollAttack(actionName: string, attackBonus: number) {
    if (!activeMonster) return;
    const sign = attackBonus >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${attackBonus}`, {
      label: `${activeMonster.name}: ${actionName} (Attack)`,
      actorName: activeMonster.name,
      actionType: 'attack',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: 'To Hit', value: attackBonus },
      ]
    });
  }

  function rollDamage(actionName: string, formula: string) {
    if (!activeMonster) return;
    chatStore.roll(formula, {
      label: `${activeMonster.name}: ${actionName} (Damage)`,
      actorName: activeMonster.name,
      actionType: 'damage',
    });
  }

  function rollSaveDc(actionName: string, dc: number, ability: string) {
    if (!activeMonster) return;
    chatStore.sendMessage(
      `⚡ **${activeMonster.name}** forces a **DC ${dc} ${ability} Saving Throw** with *${actionName}*!`,
      activeMonster.name,
      true
    );
  }

  function parseActionElements(desc: string) {
    // Detect "+X to hit"
    const hitMatch = desc.match(/([+-]?\d+)\s+to\s+hit/i);
    const hitBonus = hitMatch ? parseInt(hitMatch[1], 10) : null;

    // Detect dice damage formula "(1d8 + 3)" or "2d6"
    const dmgMatch = desc.match(/(?:Hit:\s*\d+\s*)?(?:\()?(\d+d\d+(?:\s*[+-]\s*\d+)?)(?:\))?/i);
    const dmgFormula = dmgMatch ? dmgMatch[1] : null;

    // Detect DC save e.g. "DC 13 Dexterity saving throw"
    const dcMatch = desc.match(/DC\s+(\d+)\s+([A-Za-z]+)\s+saving\s+throw/i);
    const dcValue = dcMatch ? parseInt(dcMatch[1], 10) : null;
    const dcAbility = dcMatch ? dcMatch[2] : null;

    return { hitBonus, dmgFormula, dcValue, dcAbility };
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 lg:p-6"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <div
      class="w-full max-w-2xl bg-gradient-to-b from-stone-900 to-stone-950 border-2 border-amber-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
    >
      <!-- Statblock Header -->
      <div class="px-6 py-4 bg-stone-950 border-b border-amber-700/40 flex items-center justify-between">
        <div>
          {#if activeMonster}
            <h2 class="text-2xl font-black text-amber-200 tracking-wide font-serif">{activeMonster.name}</h2>
            <p class="text-xs text-stone-400 italic">
              {activeMonster.size} {activeMonster.type}, {activeMonster.alignment}
            </p>
          {:else}
            <h2 class="text-xl font-bold text-amber-200">{monsterName || 'Monster Statblock'}</h2>
            <p class="text-xs text-stone-400">SRD Compendium Query</p>
          {/if}
        </div>

        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Statblock Body -->
      <div class="p-6 overflow-y-auto space-y-4 text-xs font-serif text-stone-300 scrollbar-thin">
        {#if !activeMonster}
          <div class="text-center py-12 text-stone-500 font-sans">
            <p>No matching monster found in compendium.</p>
          </div>
        {:else}
          <!-- Defense & Speed Bar -->
          <div class="grid grid-cols-3 gap-3 border-b border-amber-700/30 pb-3 font-sans">
            <div class="bg-stone-900/90 border border-stone-800 rounded-xl p-2.5 text-center">
              <span class="text-[10px] uppercase font-bold text-stone-500 block">Armor Class</span>
              <span class="text-lg font-black text-amber-400 font-mono">🛡️ {activeMonster.ac}</span>
            </div>
            <div class="bg-stone-900/90 border border-stone-800 rounded-xl p-2.5 text-center">
              <span class="text-[10px] uppercase font-bold text-stone-500 block">Hit Points</span>
              <span class="text-lg font-black text-rose-400 font-mono">❤️ {activeMonster.hp}</span>
            </div>
            <div class="bg-stone-900/90 border border-stone-800 rounded-xl p-2.5 text-center">
              <span class="text-[10px] uppercase font-bold text-stone-500 block">Speed / CR</span>
              <span class="text-sm font-bold text-stone-200 font-mono mt-1 block">
                {activeMonster.speed} · <span class="text-amber-400 font-black">CR {activeMonster.cr}</span>
              </span>
            </div>
          </div>

          <!-- 6 Ability Scores (Click-to-Roll Check or Save) -->
          <div>
            <span class="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-500 block mb-1.5">
              Ability Scores (Click score to roll check, or 'Save' to roll save)
            </span>
            <div class="grid grid-cols-6 gap-2 text-center font-sans">
              {#each (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) as ab}
                {@const score = activeMonster[ab] ?? 10}
                {@const mod = getMod(score)}
                <div class="bg-stone-900 border border-stone-800 rounded-xl p-2 flex flex-col justify-between">
                  <span class="text-[10px] uppercase font-bold text-stone-400">{ab}</span>
                  <button
                    type="button"
                    onclick={() => rollAbility(ab, score, 'check')}
                    class="my-1 py-0.5 rounded hover:bg-amber-950/60 active:scale-95 transition-all text-amber-300 font-bold font-mono text-sm"
                    title={`Roll ${ab.toUpperCase()} Check`}
                  >
                    {score} ({mod >= 0 ? `+${mod}` : mod})
                  </button>
                  <button
                    type="button"
                    onclick={() => rollAbility(ab, score, 'save')}
                    class="text-[9px] px-1 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold uppercase transition-colors"
                    title={`Roll ${ab.toUpperCase()} Saving Throw`}
                  >
                    Save
                  </button>
                </div>
              {/each}
            </div>
          </div>

          <!-- Actions Header -->
          <div class="pt-2 border-t border-amber-700/40">
            <h3 class="text-base font-bold text-amber-400 uppercase tracking-wider font-serif mb-2">Actions</h3>
            <div class="space-y-3 font-sans">
              {#each activeMonster.actions as action}
                {@const parsed = parseActionElements(action.description)}
                <div class="bg-stone-900/70 border border-stone-800/80 rounded-xl p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-sm text-stone-100 font-serif">{action.name}</span>
                    <div class="flex items-center gap-1.5 shrink-0">
                      {#if parsed.hitBonus !== null}
                        <button
                          type="button"
                          onclick={() => rollAttack(action.name, parsed.hitBonus!)}
                          class="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 font-mono font-bold text-[10px] transition-all active:scale-95 shadow-sm flex items-center gap-1"
                          title="Click to roll attack bonus"
                        >
                          <span>⚔️</span>
                          <span>+{parsed.hitBonus} to Hit</span>
                        </button>
                      {/if}

                      {#if parsed.dmgFormula}
                        <button
                          type="button"
                          onclick={() => rollDamage(action.name, parsed.dmgFormula!)}
                          class="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 font-mono font-bold text-[10px] transition-all active:scale-95 shadow-sm flex items-center gap-1"
                          title="Click to roll damage formula"
                        >
                          <span>💥</span>
                          <span>{parsed.dmgFormula}</span>
                        </button>
                      {/if}

                      {#if parsed.dcValue && parsed.dcAbility}
                        <button
                          type="button"
                          onclick={() => rollSaveDc(action.name, parsed.dcValue!, parsed.dcAbility!)}
                          class="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-600/50 text-indigo-300 font-mono font-bold text-[10px] transition-all active:scale-95 shadow-sm flex items-center gap-1"
                          title="Click to trigger DC Save challenge"
                        >
                          <span>⚡</span>
                          <span>DC {parsed.dcValue} {parsed.dcAbility}</span>
                        </button>
                      {/if}
                    </div>
                  </div>

                  <div class="text-xs text-stone-300 leading-relaxed">
                    <ClickToRollText text={action.description} actorName={activeMonster.name} actionName={action.name} />
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
