<script lang="ts">
  // src/lib/components/character/CharacterBuilderModal.svelte
  // 3-Mode Aleamos Character Creation Engine:
  // Mode 1: Pick & Roll (Standard Array, Point Buy, 4d6 Drop Lowest)
  // Mode 2: Morrowind-Style Thematic Quiz (10 Archipelago Scenarios)
  // Mode 3: Procedural Generator (One-Click Grounded Archetypes)

  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';

  export interface CreatedCharacter {
    id: string;
    name: string;
    playerName: string;
    race: string;
    dialect: string;
    class: string;
    level: number;
    background: string;
    alignment: string;
    // Ability scores
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    // Tri-Stat & HP
    hpCurrent: number;
    hpMax: number;
    tempHp: number;
    ac: number;
    speed: number;
    initiativeMod: number;
    passivePerception: number;
    // Durability Pools
    weaponName: string;
    weaponCurrentRp: number;
    weaponMaxRp: number;
    armorName: string;
    armorCurrentRp: number;
    armorMaxRp: number;
    // Currency
    sovereignsGp: number;
    sunDisks10Gp: number;
    tradeBars50Gp: number;
    silverSp: number;
    copperCp: number;
    // Proficiencies & Skills
    savingThrows: string[];
    skills: string[];
    tools: string[];
    bio: string;
    pin: string;
  }

  let {
    isOpen = $bindable(false),
    onCharacterCreated
  }: {
    isOpen?: boolean;
    onCharacterCreated?: (char: CreatedCharacter) => void;
  } = $props();

  type CreationMode = 'pick_and_roll' | 'morrowind_quiz' | 'procedural';
  let mode = $state<CreationMode>('pick_and_roll');

  function genPin(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return (1000 + (arr[0] % 9000)).toString();
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  function getMod(val: number): number {
    return Math.floor((val - 10) / 2);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMON CHARACTER STATE
  // ─────────────────────────────────────────────────────────────────────────────
  let charName = $state('');
  let playerName = $state('Player');
  let selectedRace = $state<'concord_human' | 'gilionite_dwarf' | 'archipelago_elf'>('concord_human');
  let selectedClass = $state('Fighter');
  let selectedBackground = $state('Chancellery Clerk');
  let bio = $state('');

  const RACES = [
    {
      id: 'concord_human' as const,
      name: 'Concord Human',
      dialect: 'Old Concord / Vaelic Common',
      bonusText: '+1 to all abilities or +1/+1 with Feat',
      applyBonus: (s: Record<string, number>) => ({
        str: s.str + 1, dex: s.dex + 1, con: s.con + 1,
        int: s.int + 1, wis: s.wis + 1, cha: s.cha + 1
      })
    },
    {
      id: 'gilionite_dwarf' as const,
      name: 'Gilionite Dwarf',
      dialect: 'Gilionite Stone-Canto',
      bonusText: '+2 CON · Smith/Mason Tools proficiency (Durability repairs)',
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex, con: s.con + 2,
        int: s.int, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'archipelago_elf' as const,
      name: 'Archipelago Islander Elf',
      dialect: 'Vaelic Island-Canto',
      bonusText: '+2 DEX · Keen Senses · High Tide Navigator',
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex + 2, con: s.con,
        int: s.int, wis: s.wis, cha: s.cha
      })
    }
  ];

  const CLASSES = [
    { name: 'Fighter', hitDie: 10, prime: 'str', saving: ['STR', 'CON'], armor: 'Chain Mail (25 RP)', weapon: 'Greatsword (30 RP)' },
    { name: 'Rogue', hitDie: 8, prime: 'dex', saving: ['DEX', 'INT'], armor: 'Leather Armor (18 RP)', weapon: 'Rapier & Shortbow (20 RP)' },
    { name: 'Wizard', hitDie: 6, prime: 'int', saving: ['INT', 'WIS'], armor: 'Scholar Robes (10 RP)', weapon: 'Arcane Staff (15 RP)' },
    { name: 'Cleric', hitDie: 8, prime: 'wis', saving: ['WIS', 'CHA'], armor: 'Scale Mail (22 RP)', weapon: 'Warhammer (25 RP)' },
    { name: 'Ranger', hitDie: 10, prime: 'dex', saving: ['STR', 'DEX'], armor: 'Studded Leather (20 RP)', weapon: 'Longbow (25 RP)' },
    { name: 'Paladin', hitDie: 10, prime: 'str', saving: ['WIS', 'CHA'], armor: 'Plate & Mail (28 RP)', weapon: 'Longsword (30 RP)' },
    { name: 'Artificer', hitDie: 8, prime: 'int', saving: ['CON', 'INT'], armor: 'Scale Mail (22 RP)', weapon: 'Heavy Crossbow (25 RP)' }
  ];

  const BACKGROUNDS = [
    'Foundry Artificer (Kladno Deep)',
    'Chancellery Clerk (Ostrava Harbor)',
    'Outrunner Bounty Hunter (Basalt Coast)',
    'Rucean Pearl Diver (Shoal Shoals)',
    'Decade Salt Merchant (High Chancellery)',
    'Reef Drake Warden (Rucean Admiralty)'
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 1: PICK & ROLL ALLOCATION
  // ─────────────────────────────────────────────────────────────────────────────
  type AllocMethod = 'standard' | 'point_buy' | 'roller';
  let allocMethod = $state<AllocMethod>('standard');

  let baseScores = $state({
    str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8
  });

  let rolledPool = $state<number[]>([]);
  let pointBuyRemaining = $state(27);

  function roll4d6DropLowest(): number {
    const rolls = [1, 2, 3, 4].map(() => Math.floor(1 + Math.random() * 6));
    rolls.sort((a, b) => a - b);
    return rolls[1] + rolls[2] + rolls[3];
  }

  function handleRollAllAttributes() {
    rolledPool = [1, 2, 3, 4, 5, 6].map(() => roll4d6DropLowest());
    rolledPool.sort((a, b) => b - a);
    baseScores = {
      str: rolledPool[0] || 15,
      dex: rolledPool[1] || 14,
      con: rolledPool[2] || 13,
      int: rolledPool[3] || 12,
      wis: rolledPool[4] || 10,
      cha: rolledPool[5] || 8
    };
    audioEngine.triggerDiceRollSfx(20);
  }

  function applyStandardArray() {
    baseScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 2: MORROWIND-STYLE THEMATIC QUIZ
  // ─────────────────────────────────────────────────────────────────────────────
  interface QuizQuestion {
    id: number;
    scenario: string;
    options: {
      text: string;
      archetype: 'combat' | 'stealth' | 'magic';
      flavor: string;
    }[];
  }

  const QUIZ_QUESTIONS: QuizQuestion[] = [
    {
      id: 1,
      scenario: 'A corsair skiff traps your rowboat against the jagged black reefs of Port Ruceas. How do you respond?',
      options: [
        { text: 'Board their vessel with bare iron and shatter their oars.', archetype: 'combat', flavor: 'Direct martial valor and raw power.' },
        { text: 'Slip into the brine with a reed and scuttle their rudder from below.', archetype: 'stealth', flavor: 'Patience, watercraft, and cunning ambush.' },
        { text: 'Invoke the tide cycle to churn foam and ignite shadow-pitch flares.', archetype: 'magic', flavor: 'Arcane manipulation and elemental mastery.' }
      ]
    },
    {
      id: 2,
      scenario: 'In the lower foundry of Kladno, an iron golem fractures its safety valve, spewing molten basalt toward innocent smelters.',
      options: [
        { text: 'Heave an anvil cart into the vent breach with brute muscle.', archetype: 'combat', flavor: 'Selfless physical endurance.' },
        { text: 'Scale the scaffolding and sever the hydraulic counterweight release.', archetype: 'stealth', flavor: 'Agile problem-solving and rapid reflexes.' },
        { text: 'Channel mana tolerance to transmute the spray into cooled obsidian.', archetype: 'magic', flavor: 'High intellectual resolve.' }
      ]
    },
    {
      id: 3,
      scenario: 'The High Chancellery of Ostrava is holding an audit of your guild charter. A corrupt clerk demands 50 Concord Sovereigns.',
      options: [
        { text: 'Slam his ledger onto his desk and challenge his lineage before the Magistrate.', archetype: 'combat', flavor: 'Unyielding honor and intimidating presence.' },
        { text: 'Pickpocket the clerk’s official seal and stamp your own clearance deed.', archetype: 'stealth', flavor: 'Streetcraft and bureaucratic infiltration.' },
        { text: 'Produce an ancient sovereign decree proving exemption under Decade municipal law.', archetype: 'magic', flavor: 'Scholarly leverage and archival acumen.' }
      ]
    },
    {
      id: 4,
      scenario: 'A dying reef drake leaves a clutch of luminous eggs in a submerged tide pool.',
      options: [
        { text: 'Defend the nest with shield and spear from scavenging reef sharks.', archetype: 'combat', flavor: 'Guardian instinct.' },
        { text: 'Conceal the eggs in kelp sacks and smuggle them to sanctuary.', archetype: 'stealth', flavor: 'Discretion and evasion.' },
        { text: 'Attune your senses to the drake spirit to absorb its primal elemental song.', archetype: 'magic', flavor: 'Mystical communion.' }
      ]
    },
    {
      id: 5,
      scenario: 'Your party is trapped in a salt mine collapse. The air grows thin as gas hisses from the fissure.',
      options: [
        { text: 'Dig relentlessly through the rubble until your fingers bleed.', archetype: 'combat', flavor: 'Tenacious physical willpower.' },
        { text: 'Locate subtle drafts along the fault line to find an unmapped flue.', archetype: 'stealth', flavor: 'Keen observation and survival instinct.' },
        { text: 'Conjure a gust to disperse the subterranean fumes and stabilize the ceiling.', archetype: 'magic', flavor: 'Calculated spellcraft.' }
      ]
    }
  ];

  let quizStep = $state(0);
  let quizAnswers = $state<Record<number, 'combat' | 'stealth' | 'magic'>>({});
  let quizResult = $state<{ archetype: 'combat' | 'stealth' | 'magic'; title: string; summary: string } | null>(null);

  function handleSelectQuizAnswer(qId: number, arch: 'combat' | 'stealth' | 'magic') {
    quizAnswers[qId] = arch;
    if (quizStep < QUIZ_QUESTIONS.length - 1) {
      quizStep++;
    } else {
      computeQuizOutcome();
    }
  }

  function computeQuizOutcome() {
    let combat = 0, stealth = 0, magic = 0;
    for (const v of Object.values(quizAnswers)) {
      if (v === 'combat') combat++;
      else if (v === 'stealth') stealth++;
      else if (v === 'magic') magic++;
    }

    let top: 'combat' | 'stealth' | 'magic' = 'combat';
    if (stealth > combat && stealth >= magic) top = 'stealth';
    else if (magic > combat && magic > stealth) top = 'magic';

    if (top === 'combat') {
      quizResult = {
        archetype: 'combat',
        title: 'The Ironward Guardian',
        summary: 'Your soul resonates with the basalt foundations of Gilionite strength. You rely on heavy steel, durability maintenance, and front-line resilience.'
      };
      selectedClass = 'Fighter';
      selectedRace = 'gilionite_dwarf';
      baseScores = { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 };
    } else if (top === 'stealth') {
      quizResult = {
        archetype: 'stealth',
        title: 'The Shoal Outrunner',
        summary: 'Your instinct is governed by the shifting archipelago tides. You excel at precision strikes, high dexterity, and evasive maneuvering.'
      };
      selectedClass = 'Rogue';
      selectedRace = 'archipelago_elf';
      baseScores = { str: 10, dex: 16, con: 14, int: 12, wis: 13, cha: 10 };
    } else {
      quizResult = {
        archetype: 'magic',
        title: 'The Tidecaller Scholar',
        summary: 'Your mind grasps the 28-essence alchemy matrix and ancient Concord celestial cycles. You command versatile arcana and high mana tolerance.'
      };
      selectedClass = 'Wizard';
      selectedRace = 'concord_human';
      baseScores = { str: 8, dex: 14, con: 13, int: 16, wis: 14, cha: 10 };
    }

    if (!charName) charName = `Hero of ${quizResult.title}`;
    bio = quizResult.summary;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 3: PROCEDURAL GENERATOR (1-CLICK)
  // ─────────────────────────────────────────────────────────────────────────────
  const FIRST_NAMES = [
    'Rowan', 'Kaelen', 'Lyra', 'Theron', 'Vaelin', 'Sariel', 'Garek', 'Darian',
    'Branoc', 'Morrigan', 'Elora', 'Jarek', 'Torvald', 'Caelum', 'Oren'
  ];
  const EPITHETS = [
    'Ironheart', 'Emberfall', 'Silverleaf', 'Stone-Singer', 'Tide-Runner',
    'Deep-Delver', 'Wave-Cutter', 'Reef-Strider', 'Sun-Watcher', 'Ostrava-Born'
  ];

  function handleGenerateProcedural() {
    const fName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lName = EPITHETS[Math.floor(Math.random() * EPITHETS.length)];
    charName = `${fName} ${lName}`;

    const rKeys: ('concord_human' | 'gilionite_dwarf' | 'archipelago_elf')[] = ['concord_human', 'gilionite_dwarf', 'archipelago_elf'];
    selectedRace = rKeys[Math.floor(Math.random() * rKeys.length)];

    const cls = CLASSES[Math.floor(Math.random() * CLASSES.length)];
    selectedClass = cls.name;
    selectedBackground = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

    // Generate balanced archetype stats based on class prime
    if (cls.prime === 'str') {
      baseScores = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };
    } else if (cls.prime === 'dex') {
      baseScores = { str: 10, dex: 16, con: 14, int: 12, wis: 13, cha: 10 };
    } else if (cls.prime === 'int') {
      baseScores = { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
    } else {
      baseScores = { str: 12, dex: 12, con: 14, int: 10, wis: 16, cha: 12 };
    }

    bio = `A stalwart ${selectedRace.replace('_', ' ')} from the ${selectedBackground}. Trained in regional dialect and armed with reliable gear.`;
    audioEngine.triggerSfx('sfx-dice-crit');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FINALIZE & SAVE
  // ─────────────────────────────────────────────────────────────────────────────
  function handleFinalizeCreation() {
    const raceDef = RACES.find(r => r.id === selectedRace) || RACES[0];
    const finalScores = raceDef.applyBonus(baseScores);
    const clsDef = CLASSES.find(c => c.name === selectedClass) || CLASSES[0];

    const conMod = getMod(finalScores.con);
    const dexMod = getMod(finalScores.dex);
    const wisMod = getMod(finalScores.wis);

    const hpMax = clsDef.hitDie + conMod;
    const ac = 10 + dexMod + (selectedClass === 'Fighter' || selectedClass === 'Paladin' ? 4 : 2);

    const newChar: CreatedCharacter = {
      id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: charName.trim() || 'Aleamos Wanderer',
      playerName: playerName.trim() || 'Player',
      race: raceDef.name,
      dialect: raceDef.dialect,
      class: selectedClass,
      level: 1,
      background: selectedBackground,
      alignment: 'Neutral Good',
      str: finalScores.str,
      dex: finalScores.dex,
      con: finalScores.con,
      int: finalScores.int,
      wis: finalScores.wis,
      cha: finalScores.cha,
      hpCurrent: hpMax,
      hpMax,
      tempHp: 0,
      ac,
      speed: selectedRace === 'gilionite_dwarf' ? 25 : 30,
      initiativeMod: dexMod,
      passivePerception: 10 + wisMod + 2,
      weaponName: clsDef.weapon,
      weaponCurrentRp: 25,
      weaponMaxRp: 25,
      armorName: clsDef.armor,
      armorCurrentRp: 20,
      armorMaxRp: 20,
      sovereignsGp: 15,
      sunDisks10Gp: 1,
      tradeBars50Gp: 0,
      silverSp: 20,
      copperCp: 50,
      savingThrows: clsDef.saving,
      skills: ['Athletics', 'Perception', 'Insight'],
      tools: selectedRace === 'gilionite_dwarf' ? ["Smith's Tools"] : ['Navigator Tools'],
      bio: bio || `Hero of Aleamos. Dialect: ${raceDef.dialect}.`,
      pin: genPin()
    };

    if (onCharacterCreated) {
      onCharacterCreated(newChar);
    }
    isOpen = false;
  }
</script>

{#if isOpen}
  <!-- Non-blocking background overlay -->
  <div
    role="button"
    tabindex="0"
    aria-label="Close modal overlay"
    onkeydown={(e) => { if (e.key === 'Escape') isOpen = false; }}
    class="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4"
    onclick={() => isOpen = false}
  >
    <!-- Modal Window -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aleamos 3-Mode Character Creation Engine"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      class="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none"
    >
      <!-- Title Header -->
      <div class="h-14 bg-slate-950/90 border-b border-slate-800 px-5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">⚔️</span>
          <div>
            <h2 class="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Aleamos Character Creator
            </h2>
            <p class="text-[10px] text-slate-400">
              3-Mode Creation Engine · Canon Regional Lore · Durability RP Pools
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="bg-slate-950 border-b border-slate-800 px-5 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onclick={() => mode = 'pick_and_roll'}
          class="px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5
            {mode === 'pick_and_roll' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>🎲 Mode 1: Pick &amp; Roll</span>
        </button>
        <button
          type="button"
          onclick={() => mode = 'morrowind_quiz'}
          class="px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5
            {mode === 'morrowind_quiz' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>📜 Mode 2: Morrowind Quiz</span>
        </button>
        <button
          type="button"
          onclick={() => mode = 'procedural'}
          class="px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5
            {mode === 'procedural' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>⚡ Mode 3: 1-Click Procedural</span>
        </button>
      </div>

      <!-- Modal Body Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-200">

        <!-- Basic Identification -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
          <div class="space-y-1">
            <label for="char-name-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Character Name</label>
            <input
              id="char-name-input"
              type="text"
              bind:value={charName}
              placeholder="e.g. Rowan Silverleaf"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div class="space-y-1">
            <label for="player-name-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Player / Actor</label>
            <input
              id="player-name-input"
              type="text"
              bind:value={playerName}
              placeholder="Player 1"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 1: PICK & ROLL
        ══════════════════════════════════════════════════════════════════════ -->
        {#if mode === 'pick_and_roll'}
          <div class="space-y-5">
            <!-- Race & Dialect Selection -->
            <div class="space-y-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                1. Aleamos Race &amp; Regional Dialect
              </span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {#each RACES as race}
                  <button
                    type="button"
                    onclick={() => selectedRace = race.id}
                    class="p-3 rounded-xl border text-left transition-all flex flex-col justify-between
                      {selectedRace === race.id ? 'bg-indigo-950/50 border-indigo-500 text-indigo-100 shadow-sm' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'}"
                  >
                    <div>
                      <div class="font-bold text-xs text-white">{race.name}</div>
                      <div class="text-[10px] text-amber-300 font-mono mt-0.5">{race.dialect}</div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-2">{race.bonusText}</div>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Class & Background -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label for="char-class-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">2. Class</label>
                <select
                  id="char-class-select"
                  bind:value={selectedClass}
                  class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {#each CLASSES as cls}
                    <option value={cls.name}>{cls.name} (d{cls.hitDie}, Prime: {cls.prime.toUpperCase()})</option>
                  {/each}
                </select>
              </div>

              <div class="space-y-1">
                <label for="char-bg-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">3. Background</label>
                <select
                  id="char-bg-select"
                  bind:value={selectedBackground}
                  class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {#each BACKGROUNDS as bg}
                    <option value={bg}>{bg}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Ability Allocation Controls -->
            <div class="space-y-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  4. Ability Score Assignment
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick={applyStandardArray}
                    class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[10px] transition-colors"
                  >
                    Standard Array (15,14,13,12,10,8)
                  </button>
                  <button
                    type="button"
                    onclick={handleRollAllAttributes}
                    class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-[10px] transition-colors shadow flex items-center gap-1"
                  >
                    <span>🎲</span> Roll 4d6 Drop Lowest
                  </button>
                </div>
              </div>

              <!-- Ability Grid -->
              <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                {#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as ab}
                  {@const val = baseScores[ab as keyof typeof baseScores]}
                  {@const mod = getMod(val)}
                  <div class="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                    <span class="text-[10px] font-bold uppercase text-slate-400 block">{ab}</span>
                    <input
                      type="number"
                      min="3"
                      max="20"
                      bind:value={baseScores[ab as keyof typeof baseScores]}
                      class="w-full text-center bg-slate-950 border border-slate-700 rounded text-sm font-mono font-bold text-white py-1 focus:outline-none focus:border-indigo-500"
                    />
                    <span class="text-[10px] font-mono text-emerald-400 block">
                      {mod >= 0 ? `+${mod}` : mod}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 2: MORROWIND-STYLE THEMATIC QUIZ
        ══════════════════════════════════════════════════════════════════════ -->
        {:else if mode === 'morrowind_quiz'}
          {@const q = QUIZ_QUESTIONS[quizStep]}
          <div class="space-y-4">
            <div class="p-4 bg-indigo-950/20 border border-indigo-800/40 rounded-xl flex items-center justify-between">
              <div>
                <span class="font-bold text-indigo-300">Archipelago Thematic Trial</span>
                <p class="text-[11px] text-slate-400">Answer tactical &amp; moral dilemmas to discover your canonical class and aptitude.</p>
              </div>
              <span class="px-2.5 py-1 bg-indigo-900/60 text-indigo-300 rounded-full font-mono text-[10px] font-bold">
                Scenario {quizStep + 1} of {QUIZ_QUESTIONS.length}
              </span>
            </div>

            <!-- Active Scenario Card -->
            <div class="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <p class="text-sm font-serif italic text-slate-200 leading-relaxed">
                "{q.scenario}"
              </p>

              <div class="space-y-2 pt-2">
                {#each q.options as opt}
                  <button
                    type="button"
                    onclick={() => handleSelectQuizAnswer(q.id, opt.archetype)}
                    class="w-full p-3.5 rounded-xl border text-left transition-all hover:border-indigo-500 hover:bg-slate-900/80 bg-slate-900/40 border-slate-800 group"
                  >
                    <div class="font-semibold text-xs text-slate-100 group-hover:text-indigo-300">
                      {opt.text}
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1">{opt.flavor}</div>
                  </button>
                {/each}
              </div>
            </div>

            {#if quizResult}
              <div class="p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-xl space-y-2 text-emerald-200">
                <span class="text-xs font-bold uppercase tracking-wider block">Trial Archetype Result:</span>
                <div class="text-base font-black text-white">{quizResult.title} ({selectedClass})</div>
                <p class="text-xs text-slate-300 leading-relaxed">{quizResult.summary}</p>
                <div class="text-[11px] text-amber-300 font-mono pt-1">
                  Optimal Stats Assigned · Race: {selectedRace.replace('_', ' ')}
                </div>
              </div>
            {/if}
          </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 3: PROCEDURAL GENERATOR
        ══════════════════════════════════════════════════════════════════════ -->
        {:else if mode === 'procedural'}
          <div class="space-y-4 text-center py-4">
            <div class="max-w-md mx-auto space-y-2">
              <span class="text-3xl">⚡</span>
              <h3 class="text-sm font-bold text-white">Instant One-Click Generation</h3>
              <p class="text-xs text-slate-400">
                Randomizes names, background charters, optimal attributes, starting equipment with Durability RP, and regional currency balances.
              </p>
            </div>

            <button
              type="button"
              onclick={handleGenerateProcedural}
              class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-lg transition-all text-xs"
            >
              🎲 Generate Aleamos Hero
            </button>

            <!-- Preview Card -->
            {#if charName}
              <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl text-left max-w-lg mx-auto space-y-2 mt-4">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <span class="font-bold text-white text-sm">{charName}</span>
                    <span class="text-[10px] text-slate-400 block">{selectedClass} · {selectedRace.replace('_', ' ')}</span>
                  </div>
                  <span class="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/40 rounded text-[10px] font-mono">
                    Level 1
                  </span>
                </div>
                <div class="text-[11px] text-slate-300 leading-relaxed">{bio}</div>
                <div class="grid grid-cols-6 gap-1 pt-2 font-mono text-center text-[10px]">
                  <div class="bg-slate-900 p-1 rounded">STR {baseScores.str}</div>
                  <div class="bg-slate-900 p-1 rounded">DEX {baseScores.dex}</div>
                  <div class="bg-slate-900 p-1 rounded">CON {baseScores.con}</div>
                  <div class="bg-slate-900 p-1 rounded">INT {baseScores.int}</div>
                  <div class="bg-slate-900 p-1 rounded">WIS {baseScores.wis}</div>
                  <div class="bg-slate-900 p-1 rounded">CHA {baseScores.cha}</div>
                </div>
              </div>
            {/if}
          </div>
        {/if}

      </div>

      <!-- Modal Footer -->
      <div class="h-14 bg-slate-950/90 border-t border-slate-800 px-5 flex items-center justify-between shrink-0">
        <span class="text-slate-500 text-[11px]">Ready to inject into DM Party Controls</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => isOpen = false}
            class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={handleFinalizeCreation}
            class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
          >
            <span>✨</span> Create Character
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
