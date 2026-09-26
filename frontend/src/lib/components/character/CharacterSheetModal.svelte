<!-- CharacterSheetModal.svelte — Interactive Digital 5e Character Sheet with Rollable Triggers & Automated Short/Long Rest Engine -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { characterStore, classResourcesStore, spellSlotsStore, executeShortRest, executeLongRest, mutateHp } from '../../../stores/characterStore';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { sendWsEvent } from '../../../stores/websocketStore';

  interface Props {
    isOpen?: boolean;
    characterOverride?: any;
    onClose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    characterOverride = null,
    onClose,
  }: Props = $props();

  type TabType = 'attributes' | 'skills' | 'actions' | 'features';
  let activeTab = $state<TabType>('attributes');

  // Short & Long Rest Prompt States
  let showShortRestModal = $state(false);
  let showLongRestModal = $state(false);
  let shortRestHealed = $state(0);
  let shortRestDiceSpent = $state(0);

  // HP mutation inputs
  let hpDeltaInput = $state<number | null>(null);

  // Character Data with Fallbacks
  const fallbackChar = {
    id: 'char-hero-1',
    name: 'Valerius of Graywood',
    playerName: 'Player 1',
    class: 'Paladin',
    level: 5,
    race: 'Human',
    background: 'Knight of the Order',
    str: 16,
    dex: 12,
    con: 14,
    int: 10,
    wis: 13,
    cha: 16,
    current_hp: 42,
    max_hp: 44,
    temp_hp: 0,
    hit_dice_current: 4,
    hit_dice_max: 5,
    hit_dice_die: 10, // d10 for Paladin
    base_ac: 18,
    speed: 30,
    passive_perception: 13,
    pin: '1234',
    resurrection_sickness_penalty: 0,
  };

  const char = $derived({
    ...fallbackChar,
    ...(characterOverride || {}),
    ...($characterStore || {}),
  });

  // ── 5e Mechanics Math ──────────────────────────────────────────────────────
  const profBonus = $derived(Math.floor((char.level - 1) / 4) + 2);
  const hpPct = $derived(Math.max(0, Math.min(100, Math.round((char.current_hp / (char.max_hp || 1)) * 100))));


  function getMod(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  function formatMod(val: number): string {
    return val >= 0 ? `+${val}` : `${val}`;
  }

  const strMod = $derived(getMod(char.str));
  const dexMod = $derived(getMod(char.dex));
  const conMod = $derived(getMod(char.con));
  const intMod = $derived(getMod(char.int));
  const wisMod = $derived(getMod(char.wis));
  const chaMod = $derived(getMod(char.cha));

  const abilityMods = $derived({
    STR: strMod,
    DEX: dexMod,
    CON: conMod,
    INT: intMod,
    WIS: wisMod,
    CHA: chaMod,
  });

  // Saving Throw Proficiencies (Default Paladin: WIS & CHA)
  let saveProficiencies = $state<Record<string, boolean>>({
    STR: false,
    DEX: false,
    CON: false,
    INT: false,
    WIS: true,
    CHA: true,
  });

  // 5e SRD 18 Skills Standard Mapping
  interface SkillDef {
    name: string;
    ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  }

  const ALL_5E_SKILLS: SkillDef[] = [
    { name: 'Acrobatics', ability: 'DEX' },
    { name: 'Animal Handling', ability: 'WIS' },
    { name: 'Arcana', ability: 'INT' },
    { name: 'Athletics', ability: 'STR' },
    { name: 'Deception', ability: 'CHA' },
    { name: 'History', ability: 'INT' },
    { name: 'Insight', ability: 'WIS' },
    { name: 'Intimidation', ability: 'CHA' },
    { name: 'Investigation', ability: 'INT' },
    { name: 'Medicine', ability: 'WIS' },
    { name: 'Nature', ability: 'INT' },
    { name: 'Perception', ability: 'WIS' },
    { name: 'Performance', ability: 'CHA' },
    { name: 'Persuasion', ability: 'CHA' },
    { name: 'Religion', ability: 'INT' },
    { name: 'Sleight of Hand', ability: 'DEX' },
    { name: 'Stealth', ability: 'DEX' },
    { name: 'Survival', ability: 'WIS' },
  ];

  // Skill Proficiency Levels: 0 = None, 1 = Proficient, 2 = Expertise
  let skillProfLevels = $state<Record<string, number>>({
    Athletics: 1,
    Insight: 1,
    Perception: 1,
    Persuasion: 2, // Expertise
    Religion: 1,
  });

  function getSkillBonus(skill: SkillDef): number {
    const baseMod = abilityMods[skill.ability] ?? 0;
    const profLevel = skillProfLevels[skill.name] ?? 0;
    return baseMod + profLevel * profBonus;
  }

  function cycleSkillProf(skillName: string) {
    const curr = skillProfLevels[skillName] ?? 0;
    const next = (curr + 1) % 3;
    skillProfLevels[skillName] = next;
  }

  // Death Saving Throws State
  let deathSaves = $state({
    successes: [false, false, false],
    failures: [false, false, false],
  });

  // Attacks & Cantrips List
  interface AttackAction {
    id: string;
    name: string;
    type: 'melee' | 'ranged' | 'spell';
    atkBonus: number;
    damageFormula: string;
    damageType: string;
  }

  let attacks = $state<AttackAction[]>([
    {
      id: 'atk-1',
      name: 'Sunforged Longsword',
      type: 'melee',
      atkBonus: 6,
      damageFormula: '1d8 + 3',
      damageType: 'Slashing / Radiant',
    },
    {
      id: 'atk-2',
      name: 'Heavy Crossbow',
      type: 'ranged',
      atkBonus: 4,
      damageFormula: '1d10 + 1',
      damageType: 'Piercing',
    },
    {
      id: 'atk-3',
      name: 'Sacred Flame',
      type: 'spell',
      atkBonus: 6,
      damageFormula: '2d8',
      damageType: 'Radiant (DEX DC 14)',
    },
  ]);

  // ── One-Click Rollable Trigger Engine ───────────────────────────────────────
  function triggerRoll(
    title: string,
    mod: number,
    e?: MouseEvent,
    actionType: 'check' | 'save' | 'attack' = 'check'
  ) {
    // Detect Shift (Advantage) or Alt/Ctrl (Disadvantage)
    let advMode: 'normal' | 'advantage' | 'disadvantage' = 'normal';
    if (e) {
      if (e.shiftKey) advMode = 'advantage';
      else if (e.altKey || e.ctrlKey) advMode = 'disadvantage';
    }

    const sign = mod >= 0 ? `+${mod}` : `${mod}`;
    let formula = `1d20${sign}`;
    let fullLabel = `${char.name}: ${title}`;

    if (advMode === 'advantage') {
      formula = `2d20kh1${sign}`;
      fullLabel += ' (Advantage)';
    } else if (advMode === 'disadvantage') {
      formula = `2d20kl1${sign}`;
      fullLabel += ' (Disadvantage)';
    }

    // Play rolling dice sound
    audioEngine.playProceduralSfx('dice');

    // Dispatch roll via chatStore & companion WebSocket relay
    chatStore.roll(formula, {
      label: fullLabel,
      actorName: char.name,
      actionType,
    });
  }

  function triggerAttackRoll(atk: AttackAction, e?: MouseEvent) {
    triggerRoll(`${atk.name} Attack`, atk.atkBonus, e, 'attack');
  }

  function triggerDamageRoll(atk: AttackAction) {
    audioEngine.playProceduralSfx('critical');
    chatStore.roll(atk.damageFormula, {
      label: `${char.name}: ${atk.name} Damage`,
      actorName: char.name,
      actionType: 'damage',
    });
  }

  function rollDeathSave() {
    const roll = Math.floor(Math.random() * 20) + 1;
    let label = `${char.name}: Death Saving Throw (${roll})`;

    if (roll === 1) {
      // Nat 1: 2 failures
      deathSaves.failures[0] = true;
      deathSaves.failures[1] = true;
      label += ' — CRITICAL FAILURE (2 Fails)';
    } else if (roll === 20) {
      // Nat 20: Regain 1 HP!
      mutateHp(1);
      deathSaves.successes = [false, false, false];
      deathSaves.failures = [false, false, false];
      label += ' — CRITICAL SUCCESS (Revived with 1 HP!)';
    } else if (roll >= 10) {
      const idx = deathSaves.successes.findIndex((s) => !s);
      if (idx >= 0) deathSaves.successes[idx] = true;
      label += ' — Success!';
    } else {
      const idx = deathSaves.failures.findIndex((f) => !f);
      if (idx >= 0) deathSaves.failures[idx] = true;
      label += ' — Failure.';
    }

    chatStore.roll(`1d20`, {
      label,
      actorName: char.name,
      actionType: 'save',
    });
  }

  // ── Automated Rest Engine ──────────────────────────────────────────────────
  function handleOpenShortRest() {
    shortRestHealed = 0;
    shortRestDiceSpent = 0;
    showShortRestModal = true;
  }

  function rollShortRestHitDie() {
    if (char.hit_dice_current <= 0) return;

    const dieSides = char.hit_dice_die || 10;
    const dieRoll = Math.floor(Math.random() * dieSides) + 1;
    const healAmount = Math.max(0, dieRoll + conMod);

    shortRestHealed += healAmount;
    shortRestDiceSpent += 1;

    audioEngine.playProceduralSfx('dice');

    // Optimistically update HP & HD
    mutateHp(char.current_hp + healAmount);
    executeShortRest(healAmount, 1);

    chatStore.roll(`1d${dieSides}+${conMod}`, {
      label: `${char.name} Short Rest: Hit Die (d${dieSides}+${conMod}) -> Recovered ${healAmount} HP`,
      actorName: char.name,
      actionType: 'custom',
    });
  }

  async function handleConfirmLongRest() {
    audioEngine.playProceduralSfx('level_up');
    await executeLongRest();

    // Reset death saves
    deathSaves.successes = [false, false, false];
    deathSaves.failures = [false, false, false];

    chatStore.roll(`0`, {
      label: `${char.name} completed a Long Rest: HP and spell slots fully restored!`,
      actorName: char.name,
      actionType: 'custom',
    });

    showLongRestModal = false;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in select-none">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full h-[90vh] max-h-[820px] flex flex-col overflow-hidden">
      <!-- ── Sheet Header ─────────────────────────────────────────────────────── -->
      <div class="bg-slate-950/80 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-black text-slate-100 tracking-tight">{char.name}</h2>
            <span class="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-xs font-bold font-mono">
              Level {char.level} {char.class}
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">
            {char.race} • {char.background} • Proficiency <strong class="text-indigo-400">+{profBonus}</strong>
          </p>
        </div>

        <!-- Resting & Controls Action Group -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={handleOpenShortRest}
            class="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span>☕</span>
            <span>Short Rest</span>
          </button>

          <button
            type="button"
            onclick={() => (showLongRestModal = true)}
            class="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span>🌙</span>
            <span>Long Rest</span>
          </button>

          <button
            type="button"
            onclick={() => {
              isOpen = false;
              onClose?.();
            }}
            class="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors ml-2 font-bold"
            aria-label="Close Character Sheet"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- ── Tab Navigation ───────────────────────────────────────────────────── -->
      <div class="bg-slate-950 border-b border-slate-800/80 px-6 flex items-center gap-2 text-xs font-semibold overflow-x-auto no-scrollbar">
        <button
          type="button"
          onclick={() => (activeTab = 'attributes')}
          class="px-4 py-3 border-b-2 transition-colors flex items-center gap-2
            {activeTab === 'attributes' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>⚔️</span>
          <span>Main &amp; Vitals</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'skills')}
          class="px-4 py-3 border-b-2 transition-colors flex items-center gap-2
            {activeTab === 'skills' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>🎯</span>
          <span>Skills &amp; Saves</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'actions')}
          class="px-4 py-3 border-b-2 transition-colors flex items-center gap-2
            {activeTab === 'actions' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>🗡️</span>
          <span>Attacks &amp; Actions</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'features')}
          class="px-4 py-3 border-b-2 transition-colors flex items-center gap-2
            {activeTab === 'features' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>✨</span>
          <span>Features &amp; Slots</span>
        </button>
      </div>

      <!-- ── Tab Content Body ─────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- ═════════════════════════════════════════════════════════════════════
             TAB 1: MAIN & VITALS
        ══════════════════════════════════════════════════════════════════════ -->
        {#if activeTab === 'attributes'}
          <!-- 6 Ability Score Pods -->
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {#each ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as ability}
              {@const score = char[ability.toLowerCase() as keyof typeof char] as number}
              {@const mod = abilityMods[ability as keyof typeof abilityMods]}
              <button
                type="button"
                onclick={(e) => triggerRoll(`${ability} Check`, mod, e)}
                class="bg-slate-950 p-3 rounded-2xl border border-slate-800 hover:border-indigo-500/80 transition-all text-center flex flex-col items-center justify-between group cursor-pointer shadow-sm hover:scale-102"
                title="Click to roll check. Hold Shift for Advantage, Alt for Disadvantage"
              >
                <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{ability}</span>
                <span class="text-2xl font-black text-indigo-300 my-0.5 group-hover:text-indigo-200">
                  {formatMod(mod)}
                </span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                  {score}
                </span>
              </button>
            {/each}
          </div>

          <!-- Combat Vitals Row (AC, Initiative, Speed, Passive Perception) -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Armor Class</span>
                <span class="text-2xl font-black text-slate-100">{char.base_ac}</span>
              </div>
              <span class="text-2xl opacity-60">🛡️</span>
            </div>

            <button
              type="button"
              onclick={(e) => triggerRoll('Initiative', dexMod, e)}
              class="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 hover:border-indigo-500/80 text-left flex items-center justify-between transition-colors group cursor-pointer"
              title="Click to roll Initiative. Hold Shift for Advantage"
            >
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Initiative</span>
                <span class="text-2xl font-black text-amber-300 group-hover:text-amber-200">{formatMod(dexMod)}</span>
              </div>
              <span class="text-2xl opacity-60">⚡</span>
            </button>

            <div class="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Speed</span>
                <span class="text-2xl font-black text-slate-100">{char.speed} <small class="text-xs text-slate-500 font-normal">ft</small></span>
              </div>
              <span class="text-2xl opacity-60">👟</span>
            </div>

            <div class="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Passive Perception</span>
                <span class="text-2xl font-black text-slate-100">{char.passive_perception}</span>
              </div>
              <span class="text-2xl opacity-60">👁️</span>
            </div>
          </div>

          <!-- Hit Points & Death Saves Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Hit Points Card -->
            <div class="bg-slate-950 p-5 rounded-3xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Hit Points</span>
                  <div class="flex items-baseline gap-2 mt-1">
                    <span class="text-3xl font-black text-emerald-400">{char.current_hp}</span>
                    <span class="text-sm font-semibold text-slate-500">/ {char.max_hp} MAX</span>
                    {#if char.temp_hp > 0}
                      <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/80">
                        +{char.temp_hp} TEMP
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- Hit Dice Pill -->
                <div class="text-right">
                  <span class="text-[10px] font-bold text-slate-500 uppercase block">Hit Dice</span>
                  <span class="text-sm font-bold font-mono text-amber-300">
                    {char.hit_dice_current} / {char.hit_dice_max} d{char.hit_dice_die || 10}
                  </span>
                </div>
              </div>

              <!-- HP Bar -->
              <div class="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  class="h-full rounded-full transition-all duration-300
                    {hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-rose-500'}"
                  style="width: {hpPct}%;"
                ></div>
              </div>

              <!-- Quick Damage / Healing Adjustment Input -->
              <div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <input
                  type="number"
                  placeholder="Amount"
                  bind:value={hpDeltaInput}
                  class="w-24 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onclick={() => {
                    if (hpDeltaInput && hpDeltaInput > 0) {
                      mutateHp(char.current_hp + hpDeltaInput);
                      hpDeltaInput = null;
                    }
                  }}
                  class="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-800/60"
                >
                  + Heal
                </button>
                <button
                  type="button"
                  onclick={() => {
                    if (hpDeltaInput && hpDeltaInput > 0) {
                      mutateHp(char.current_hp - hpDeltaInput);
                      hpDeltaInput = null;
                    }
                  }}
                  class="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl border border-rose-800/60"
                >
                  - Damage
                </button>
              </div>
            </div>

            <!-- Death Saves & Conditions -->
            <div class="bg-slate-950 p-5 rounded-3xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Death Saving Throws</span>
                <button
                  type="button"
                  onclick={rollDeathSave}
                  class="px-3 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-800/80 flex items-center gap-1.5"
                >
                  <span>🎲</span>
                  <span>Roll Save</span>
                </button>
              </div>

              <div class="space-y-3">
                <!-- Successes -->
                <div class="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span>✓</span> Successes
                  </span>
                  <div class="flex items-center gap-2">
                    {#each [0, 1, 2] as idx}
                      <button
                        type="button"
                        onclick={() => (deathSaves.successes[idx] = !deathSaves.successes[idx])}
                        class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                          {deathSaves.successes[idx] ? 'bg-emerald-500 border-emerald-400 text-black font-bold text-xs' : 'border-slate-700 bg-slate-950'}"
                      >
                        {deathSaves.successes[idx] ? '✓' : ''}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Failures -->
                <div class="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span class="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <span>✕</span> Failures
                  </span>
                  <div class="flex items-center gap-2">
                    {#each [0, 1, 2] as idx}
                      <button
                        type="button"
                        onclick={() => (deathSaves.failures[idx] = !deathSaves.failures[idx])}
                        class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                          {deathSaves.failures[idx] ? 'bg-rose-500 border-rose-400 text-white font-bold text-xs' : 'border-slate-700 bg-slate-950'}"
                      >
                        {deathSaves.failures[idx] ? '✕' : ''}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Reset death saves button -->
              <div class="flex justify-end">
                <button
                  type="button"
                  onclick={() => {
                    deathSaves.successes = [false, false, false];
                    deathSaves.failures = [false, false, false];
                  }}
                  class="text-[10px] text-slate-500 hover:text-slate-300 underline"
                >
                  Reset Pips
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- ═════════════════════════════════════════════════════════════════════
             TAB 2: SKILLS & SAVING THROWS
        ══════════════════════════════════════════════════════════════════════ -->
        {#if activeTab === 'skills'}
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Saving Throws Column -->
            <div class="lg:col-span-5 space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>🛡️</span>
                <span>Saving Throws</span>
              </h3>

              <div class="space-y-1.5 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                {#each ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as ability}
                  {@const isProf = saveProficiencies[ability]}
                  {@const bonus = (abilityMods[ability as keyof typeof abilityMods] || 0) + (isProf ? profBonus : 0)}
                  <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
                    <div class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isProf}
                        onchange={() => (saveProficiencies[ability] = !saveProficiencies[ability])}
                        class="accent-indigo-500 rounded cursor-pointer"
                        title="Toggle Proficiency"
                      />
                      <span class="text-xs font-semibold text-slate-200">{ability}</span>
                    </div>

                    <button
                      type="button"
                      onclick={(e) => triggerRoll(`${ability} Saving Throw`, bonus, e, 'save')}
                      class="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 text-xs font-mono font-bold transition-transform hover:scale-105"
                      title="Roll Save (Shift for Advantage)"
                    >
                      {formatMod(bonus)}
                    </button>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Skills Column -->
            <div class="lg:col-span-7 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span>🎯</span>
                  <span>5e Skills</span>
                </h3>
                <span class="text-[11px] text-slate-500">
                  Tap ring to cycle: <span class="text-slate-400">None</span> • <span class="text-indigo-400">Prof</span> • <span class="text-amber-400 font-bold">Expertise</span>
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800 max-h-[500px] overflow-y-auto">
                {#each ALL_5E_SKILLS as skill}
                  {@const profLevel = skillProfLevels[skill.name] ?? 0}
                  {@const bonus = getSkillBonus(skill)}
                  <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
                    <div class="flex items-center gap-2 truncate">
                      <!-- 3-Way Proficiency Badge -->
                      <button
                        type="button"
                        onclick={() => cycleSkillProf(skill.name)}
                        class="w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors
                          {profLevel === 2 ? 'bg-amber-500 border-amber-400 text-black' : profLevel === 1 ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-950'}"
                        title="Cycle None / Proficient / Expertise"
                      >
                        {profLevel === 2 ? 'E' : profLevel === 1 ? 'P' : ''}
                      </button>

                      <div class="truncate">
                        <span class="text-xs font-semibold text-slate-200 block truncate">{skill.name}</span>
                        <span class="text-[10px] text-slate-500 font-mono">{skill.ability}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onclick={(e) => triggerRoll(`${skill.name} Check`, bonus, e)}
                      class="px-2 py-0.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 text-xs font-mono font-bold transition-transform hover:scale-105 shrink-0 ml-2"
                      title="Roll Skill Check (Shift for Advantage)"
                    >
                      {formatMod(bonus)}
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- ═════════════════════════════════════════════════════════════════════
             TAB 3: ACTIONS & ATTACKS
        ══════════════════════════════════════════════════════════════════════ -->
        {#if activeTab === 'actions'}
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>🗡️</span>
                <span>Weapon Attacks &amp; Cantrips</span>
              </h3>
            </div>

            <div class="space-y-2">
              {#each attacks as atk (atk.id)}
                <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-bold text-slate-100">{atk.name}</span>
                      <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono uppercase">
                        {atk.type}
                      </span>
                    </div>
                    <div class="text-xs text-slate-400 mt-1 flex items-center gap-3">
                      <span>Hit: <strong class="text-indigo-300 font-mono">{formatMod(atk.atkBonus)}</strong></span>
                      <span>•</span>
                      <span>Dmg: <strong class="text-amber-300 font-mono">{atk.damageFormula}</strong></span>
                      <span>•</span>
                      <span class="text-slate-500">{atk.damageType}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={(e) => triggerAttackRoll(atk, e)}
                      class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                      title="Roll To-Hit (Shift for Advantage)"
                    >
                      Attack ({formatMod(atk.atkBonus)})
                    </button>
                    <button
                      type="button"
                      onclick={() => triggerDamageRoll(atk)}
                      class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/60 text-xs font-bold rounded-xl transition-colors"
                    >
                      Damage
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- ═════════════════════════════════════════════════════════════════════
             TAB 4: FEATURES & CLASS RESOURCES
        ══════════════════════════════════════════════════════════════════════ -->
        {#if activeTab === 'features'}
          <div class="space-y-6">
            <!-- Class Resources Trackers (Ki, Rage, Action Surge, etc.) -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>⚡</span>
                <span>Class Resources &amp; Pools</span>
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {#each $classResourcesStore as res (res.id)}
                  <div class="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-2">
                    <div class="flex items-start justify-between">
                      <span class="text-xs font-bold text-slate-200">{res.name}</span>
                      <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold
                        {res.resetOn === 'short' ? 'bg-amber-950 text-amber-300 border border-amber-800/60' : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'}">
                        {res.resetOn === 'short' ? 'Short Rest' : 'Long Rest'}
                      </span>
                    </div>

                    <!-- Pips & Steppers -->
                    <div class="flex items-center justify-between pt-1">
                      <span class="text-xs font-mono text-slate-400">
                        Remaining: <strong class="text-white">{res.total - res.used}</strong> / {res.total}
                      </span>
                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={res.used >= res.total}
                          onclick={() => {
                            classResourcesStore.update((list) =>
                              list.map((r) => (r.id === res.id ? { ...r, used: r.used + 1 } : r))
                            );
                          }}
                          class="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center justify-center"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          disabled={res.used <= 0}
                          onclick={() => {
                            classResourcesStore.update((list) =>
                              list.map((r) => (r.id === res.id ? { ...r, used: r.used - 1 } : r))
                            );
                          }}
                          class="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Spell Slots Matrix -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>🔮</span>
                <span>Spell Slots</span>
              </h3>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {#each $spellSlotsStore as slot}
                  <div class="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span class="text-[10px] font-bold uppercase text-slate-500 block">Level {slot.level}</span>
                      <span class="text-sm font-bold font-mono text-indigo-300">
                        {slot.total - slot.used} / {slot.total}
                      </span>
                    </div>

                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={slot.used >= slot.total}
                        onclick={() => {
                          spellSlotsStore.update((slots) =>
                            slots.map((s) => (s.level === slot.level ? { ...s, used: s.used + 1 } : s))
                          );
                        }}
                        class="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-800/60 hover:bg-indigo-900 disabled:opacity-40 text-xs font-bold text-indigo-200 flex items-center justify-center"
                      >
                        Cast
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- ── Footer ───────────────────────────────────────────────────────────── -->
      <div class="bg-slate-950/80 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
        <span>Click attribute or skill to roll • Hold <kbd class="px-1 rounded bg-slate-800 text-slate-300">Shift</kbd> for Advantage • Hold <kbd class="px-1 rounded bg-slate-800 text-slate-300">Alt</kbd> for Disadvantage</span>
        <button
          type="button"
          onclick={() => {
            isOpen = false;
            onClose?.();
          }}
          class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Short Rest Modal Prompt ────────────────────────────────────────────── -->
{#if showShortRestModal}
  <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in select-none">
    <div class="bg-slate-900 border border-amber-800/80 rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-amber-200 flex items-center gap-2">
          <span>☕</span>
          <span>Short Rest Recovery</span>
        </h3>
        <button
          type="button"
          onclick={() => (showShortRestModal = false)}
          class="text-slate-400 hover:text-white font-bold"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-300 leading-relaxed">
        Spend available Hit Dice to recover hit points. All class features flagged for Short Rest (e.g. Action Surge, Ki) will automatically reset.
      </p>

      <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Available Hit Dice</span>
          <span class="text-xl font-bold font-mono text-amber-300">
            {char.hit_dice_current} <span class="text-xs text-slate-500">/ {char.hit_dice_max} (d{char.hit_dice_die || 10})</span>
          </span>
        </div>

        <button
          type="button"
          disabled={char.hit_dice_current <= 0}
          onclick={rollShortRestHitDie}
          class="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5"
        >
          <span>🎲</span>
          <span>Roll 1d{char.hit_dice_die || 10}+{conMod}</span>
        </button>
      </div>

      {#if shortRestDiceSpent > 0}
        <div class="p-3 bg-emerald-950/40 rounded-xl border border-emerald-800/60 text-xs text-emerald-300 flex items-center justify-between">
          <span>Recovered {shortRestHealed} HP ({shortRestDiceSpent} Hit Dice spent)</span>
          <span class="font-bold">Current HP: {char.current_hp} / {char.max_hp}</span>
        </div>
      {/if}

      <div class="flex justify-end pt-2 border-t border-slate-800">
        <button
          type="button"
          onclick={() => (showShortRestModal = false)}
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
        >
          Done Resting
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Long Rest Modal Prompt ─────────────────────────────────────────────── -->
{#if showLongRestModal}
  <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in select-none">
    <div class="bg-slate-900 border border-indigo-800/80 rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-indigo-200 flex items-center gap-2">
          <span>🌙</span>
          <span>Complete Long Rest</span>
        </h3>
        <button
          type="button"
          onclick={() => (showLongRestModal = false)}
          class="text-slate-400 hover:text-white font-bold"
        >
          ✕
        </button>
      </div>

      <p class="text-xs text-slate-300 leading-relaxed">
        A period of extended downtime (at least 8 hours). Confirming will apply standard 5e long rest recovery:
      </p>

      <ul class="text-xs text-slate-300 space-y-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 font-medium">
        <li class="flex items-center gap-2">
          <span class="text-emerald-400">✓</span> Current HP resets to maximum ({char.max_hp} HP)
        </li>
        <li class="flex items-center gap-2">
          <span class="text-emerald-400">✓</span> Temporary HP is cleared
        </li>
        <li class="flex items-center gap-2">
          <span class="text-emerald-400">✓</span> Regain {Math.max(1, Math.floor(char.hit_dice_max / 2))} Hit Dice (up to max {char.hit_dice_max})
        </li>
        <li class="flex items-center gap-2">
          <span class="text-emerald-400">✓</span> All spell slots and class feature pools restored
        </li>
        <li class="flex items-center gap-2">
          <span class="text-emerald-400">✓</span> Decrement exhaustion and resurrection penalties
        </li>
      </ul>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onclick={() => (showLongRestModal = false)}
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleConfirmLongRest}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md"
        >
          Take Long Rest
        </button>
      </div>
    </div>
  </div>
{/if}
