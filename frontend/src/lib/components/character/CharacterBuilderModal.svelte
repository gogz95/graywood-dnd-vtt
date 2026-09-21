<script lang="ts">
  // src/lib/components/character/CharacterBuilderModal.svelte
  // 3-Mode System-Neutral 5e SRD Character Creation Engine:
  // Mode 1: Pick & Roll (Standard Array, Point Buy, 4d6 Drop Lowest)
  // Mode 2: Guided Aptitude Quiz (Moral & Tactical Inquiry)
  // Mode 3: Procedural Generator (One-Click 5e SRD Archetypes)

  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import {
    STANDARD_5E_RACES,
    STANDARD_5E_CLASSES,
    STANDARD_5E_LANGUAGES
  } from '../../data/languages';
  import GuidedQuizBuilder from './GuidedQuizBuilder.svelte';
  import {
    buildStandardCharacter,
    CLASS_ARCHETYPES
  } from '../../services/classQuizEngine';

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
    // Standard 5e HP & Armor
    hpCurrent: number;
    hpMax: number;
    tempHp: number;
    ac: number;
    speed: number;
    initiativeMod: number;
    passivePerception: number;
    // Equipment
    weaponName: string;
    armorName: string;
    // Standard 5e Currencies
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
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

  type CreationMode = 'pick_and_roll' | 'guided_quiz' | 'procedural';
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
  let charLevel = $state(1);
  let playerName = $state('Player');
  let selectedRace = $state<string>('Human');
  let selectedClass = $state<string>('Fighter');
  let selectedBackground = $state('Soldier');
  let bio = $state('');
  let proceduralCharacter = $state<CreatedCharacter | null>(null);

  const RACES = [
    {
      id: 'Human',
      name: 'Human',
      language: 'Common',
      bonusText: '+1 to all ability scores',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str + 1, dex: s.dex + 1, con: s.con + 1,
        int: s.int + 1, wis: s.wis + 1, cha: s.cha + 1
      })
    },
    {
      id: 'Elf',
      name: 'Elf',
      language: 'Elvish',
      bonusText: '+2 DEX · Darkvision · Keen Senses',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex + 2, con: s.con,
        int: s.int, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'Dwarf',
      name: 'Dwarf',
      language: 'Dwarvish',
      bonusText: '+2 CON · Dwarven Resilience · Stonecunning',
      speed: 25,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex, con: s.con + 2,
        int: s.int, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'Halfling',
      name: 'Halfling',
      language: 'Halfling',
      bonusText: '+2 DEX · Lucky · Brave · Halfling Nimbleness',
      speed: 25,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex + 2, con: s.con,
        int: s.int, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'Dragonborn',
      name: 'Dragonborn',
      language: 'Draconic',
      bonusText: '+2 STR, +1 CHA · Draconic Ancestry · Breath Weapon',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str + 2, dex: s.dex, con: s.con,
        int: s.int, wis: s.wis, cha: s.cha + 1
      })
    },
    {
      id: 'Gnome',
      name: 'Gnome',
      language: 'Gnomish',
      bonusText: '+2 INT · Darkvision · Gnome Cunning',
      speed: 25,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex, con: s.con,
        int: s.int + 2, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'Half-Elf',
      name: 'Half-Elf',
      language: 'Common, Elvish',
      bonusText: '+2 CHA, +1 DEX, +1 CON · Fey Ancestry',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex + 1, con: s.con + 1,
        int: s.int, wis: s.wis, cha: s.cha + 2
      })
    },
    {
      id: 'Half-Orc',
      name: 'Half-Orc',
      language: 'Orc',
      bonusText: '+2 STR, +1 CON · Relentless Endurance · Savage Attacks',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str + 2, dex: s.dex, con: s.con + 1,
        int: s.int, wis: s.wis, cha: s.cha
      })
    },
    {
      id: 'Tiefling',
      name: 'Tiefling',
      language: 'Infernal',
      bonusText: '+2 CHA, +1 INT · Hellish Resistance · Infernal Legacy',
      speed: 30,
      applyBonus: (s: Record<string, number>) => ({
        str: s.str, dex: s.dex, con: s.con,
        int: s.int + 1, wis: s.wis, cha: s.cha + 2
      })
    }
  ];

  const CLASSES = [
    { name: 'Barbarian', hitDie: 12, prime: 'str', saving: ['STR', 'CON'], armor: 'Unarmored Defense', weapon: 'Greataxe' },
    { name: 'Bard', hitDie: 8, prime: 'cha', saving: ['DEX', 'CHA'], armor: 'Leather Armor', weapon: 'Rapier & Lute' },
    { name: 'Cleric', hitDie: 8, prime: 'wis', saving: ['WIS', 'CHA'], armor: 'Scale Mail & Shield', weapon: 'Warhammer' },
    { name: 'Druid', hitDie: 8, prime: 'wis', saving: ['INT', 'WIS'], armor: 'Hide Armor & Wooden Shield', weapon: 'Scimitar' },
    { name: 'Fighter', hitDie: 10, prime: 'str', saving: ['STR', 'CON'], armor: 'Chain Mail & Shield', weapon: 'Longsword' },
    { name: 'Monk', hitDie: 8, prime: 'dex', saving: ['STR', 'DEX'], armor: 'Unarmored Defense', weapon: 'Shortsword & Unarmed Strike' },
    { name: 'Paladin', hitDie: 10, prime: 'str', saving: ['WIS', 'CHA'], armor: 'Chain Mail & Holy Symbol', weapon: 'Warhammer' },
    { name: 'Ranger', hitDie: 10, prime: 'dex', saving: ['STR', 'DEX'], armor: 'Scale Mail', weapon: 'Longbow & Shortswords' },
    { name: 'Rogue', hitDie: 8, prime: 'dex', saving: ['DEX', 'INT'], armor: 'Leather Armor', weapon: 'Rapier & Shortbow' },
    { name: 'Sorcerer', hitDie: 6, prime: 'cha', saving: ['CON', 'CHA'], armor: 'Arcane Focus', weapon: 'Daggers & Light Crossbow' },
    { name: 'Warlock', hitDie: 8, prime: 'cha', saving: ['WIS', 'CHA'], armor: 'Leather Armor', weapon: 'Eldritch Focus & Dagger' },
    { name: 'Wizard', hitDie: 6, prime: 'int', saving: ['INT', 'WIS'], armor: 'Scholar Robes', weapon: 'Arcane Staff & Spellbook' }
  ];

  const BACKGROUNDS = [
    'Acolyte',
    'Criminal',
    'Folk Hero',
    'Noble',
    'Sage',
    'Soldier',
    'Outlander',
    'Guild Artisan'
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
    audioEngine.triggerSfx('sfx-dice');
  }

  function applyStandardArray() {
    baseScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 2: GUIDED APTITUDE QUIZ (MORAL & TACTICAL INQUIRY)
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
      scenario: 'A heavy iron portcullis in ancient ruins is slowly descending, threatening to trap an ally behind it. How do you react?',
      options: [
        { text: 'Brace your shoulders and heave the iron gate upward with sheer strength.', archetype: 'combat', flavor: 'Martial power, courage, and physical resolve.' },
        { text: 'Dive beneath the iron teeth and jam a steel piton into the gear track.', archetype: 'stealth', flavor: 'Rapid reflexes, dexterity, and tactical cunning.' },
        { text: 'Inscribe a kinetic sigil or cast an arcane ward to freeze the lowering winch.', archetype: 'magic', flavor: 'Arcane study, willpower, and magical insight.' }
      ]
    },
    {
      id: 2,
      scenario: 'A corrupt city watch captain attempts to extort an unlawful toll from unarmed travelers at the gate.',
      options: [
        { text: 'Draw your weapon and challenge his authority under the rule of military law.', archetype: 'combat', flavor: 'Unyielding honor and commanding presence.' },
        { text: 'Slip over the parapets through the shadow of the watchtower to open the postern gate.', archetype: 'stealth', flavor: 'Infiltration, stealth, and streetcraft.' },
        { text: 'Produce a sealed imperial charter or invoke an enchantment to expose his fraud.', archetype: 'magic', flavor: 'Diplomatic leverage and esoteric acumen.' }
      ]
    },
    {
      id: 3,
      scenario: 'Bandit archers launch a surprise ambush from rocky cliffs overlooking a narrow mountain trail.',
      options: [
        { text: 'Raise your shield, charge the rocky slope, and engage the ambushers head-on.', archetype: 'combat', flavor: 'Front-line bravery and tactical assault.' },
        { text: 'Melt into the dense underbrush and stalk the archers with quiet flanking fire.', archetype: 'stealth', flavor: 'Wilderness survival and silent tracking.' },
        { text: 'Summon a blast of thunderous wind or protective barrier to deflect the arrows.', archetype: 'magic', flavor: 'Elemental mastery and defensive spellcraft.' }
      ]
    },
    {
      id: 4,
      scenario: 'A trapped stone vault in a forgotten crypt is armed with poisonous needles and warding runes.',
      options: [
        { text: 'Smash the triggering lock mechanism with a heavy maul from behind total cover.', archetype: 'combat', flavor: 'Direct destructive force.' },
        { text: 'Carefully probe the tumbler pins with fine thieves’ tools to disarm the mechanism.', archetype: 'stealth', flavor: 'Meticulous precision and mechanical expertise.' },
        { text: 'Trace the glyph lines to unravel the magical ward without disturbing the physical lock.', archetype: 'magic', flavor: 'Deep lore, arcana, and ritual knowledge.' }
      ]
    },
    {
      id: 5,
      scenario: 'A rowdy brawl erupts in a crowded tavern when blades are drawn over an overturned card game.',
      options: [
        { text: 'Wade into the fray, disarm the aggressors, and restore order with brute discipline.', archetype: 'combat', flavor: 'Martial intimidation and physical control.' },
        { text: 'Weave through the chaotic brawl, secure the wager purse, and vanish out the back door.', archetype: 'stealth', flavor: 'Opportunism, nimble footwork, and escape.' },
        { text: 'Cast a soothing enchantment or deliver a stirring verse to calm the hostile room.', archetype: 'magic', flavor: 'Enchantment, charisma, and magical influence.' }
      ]
    }
  ];

  let quizStep = $state(0);
  let currentQuizQ = $derived(QUIZ_QUESTIONS[quizStep]);
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
        title: 'The Stalwart Vanguard',
        summary: 'Your instincts align with front-line valor, defensive mastery, and martial leadership.'
      };
      selectedClass = 'Fighter';
      selectedRace = 'Human';
      baseScores = { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 };
    } else if (top === 'stealth') {
      quizResult = {
        archetype: 'stealth',
        title: 'The Shadow Infiltrator',
        summary: 'Your instinct favors nimble agility, precision strikes, and calculated opportunism.'
      };
      selectedClass = 'Rogue';
      selectedRace = 'Elf';
      baseScores = { str: 10, dex: 16, con: 14, int: 12, wis: 13, cha: 10 };
    } else {
      quizResult = {
        archetype: 'magic',
        title: 'The Arcane Inquirer',
        summary: 'Your mind seeks hidden truths, arcane manipulation, and supernatural problem-solving.'
      };
      selectedClass = 'Wizard';
      selectedRace = 'Human';
      baseScores = { str: 8, dex: 14, con: 13, int: 16, wis: 14, cha: 10 };
    }

    if (!charName) charName = `Champion of the Realm`;
    bio = quizResult.summary;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 3: PROCEDURAL GENERATOR (1-CLICK STANDARD 5E ARCHETYPES)
  // ─────────────────────────────────────────────────────────────────────────────
  const FIRST_NAMES = [
    'Rowan', 'Kaelen', 'Lyra', 'Theron', 'Vaelin', 'Sariel', 'Garek', 'Darian',
    'Branoc', 'Morrigan', 'Elora', 'Jarek', 'Torvald', 'Caelum', 'Oren'
  ];
  const EPITHETS = [
    'Ironheart', 'Emberfall', 'Silverleaf', 'Stone-Singer', 'Swift-Runner',
    'Deep-Delver', 'Gale-Cutter', 'Path-Finder', 'Sun-Watcher', 'Grey-Mantle'
  ];

  function handleGenerateProcedural() {
    const fName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lName = EPITHETS[Math.floor(Math.random() * EPITHETS.length)];
    const defaultName = `${fName} ${lName}`;
    const nameToUse = charName.trim() || defaultName;

    const classKeys = Object.keys(CLASS_ARCHETYPES);
    const chosenClassKey = classKeys[Math.floor(Math.random() * classKeys.length)];

    proceduralCharacter = buildStandardCharacter(
      nameToUse,
      charLevel,
      chosenClassKey
    );
    charName = proceduralCharacter.name;
    selectedRace = proceduralCharacter.race;
    selectedClass = proceduralCharacter.class;
    selectedBackground = proceduralCharacter.background;
    bio = proceduralCharacter.bio;
    audioEngine.triggerSfx('sfx-dice-crit');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FINALIZE & SAVE
  // ─────────────────────────────────────────────────────────────────────────────
  function handleFinalizeCreation() {
    if (mode === 'procedural' && proceduralCharacter) {
      if (onCharacterCreated) {
        onCharacterCreated(proceduralCharacter);
      }
      isOpen = false;
      return;
    }

    const raceDef = RACES.find(r => r.name === selectedRace) || RACES[0];
    const finalScores = raceDef.applyBonus(baseScores);
    const clsDef = CLASSES.find(c => c.name === selectedClass) || CLASSES[0];

    const conMod = getMod(finalScores.con);
    const dexMod = getMod(finalScores.dex);
    const wisMod = getMod(finalScores.wis);

    const avgHitDie = Math.floor(clsDef.hitDie / 2) + 1;
    const hpMax = clsDef.hitDie + conMod + (charLevel - 1) * Math.max(1, avgHitDie + conMod);
    const ac = 10 + dexMod + (selectedClass === 'Fighter' || selectedClass === 'Paladin' ? 4 : 2);

    const newChar: CreatedCharacter = {
      id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: charName.trim() || `${raceDef.name} ${clsDef.name}`,
      playerName: playerName.trim() || 'Player',
      race: raceDef.name,
      dialect: raceDef.language,
      class: selectedClass,
      level: charLevel,
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
      speed: raceDef.speed,
      initiativeMod: dexMod, // STRICT 5E DEXTERITY MODIFIER
      passivePerception: 10 + wisMod + 2,
      weaponName: clsDef.weapon,
      armorName: clsDef.armor,
      cp: 50,
      sp: 20,
      ep: 0,
      gp: 15 + charLevel * 10,
      pp: 0,
      savingThrows: clsDef.saving,
      skills: ['Athletics', 'Perception', 'Insight'],
      tools: ["Thieves' Tools"],
      bio: bio || `5e Adventurer. Speaks ${raceDef.language}.`,
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
      aria-label="Standard 5e Character Creation Engine"
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
              5e Character Creator
            </h2>
            <p class="text-[10px] text-slate-400">
              Strict System-Neutral 5e SRD Baseline · 3 Creation Modes
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
          <span>🎲</span>
          <span>1. Pick &amp; Roll</span>
        </button>
        <button
          type="button"
          onclick={() => mode = 'guided_quiz'}
          class="px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5
            {mode === 'guided_quiz' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>📜</span>
          <span>2. Guided Aptitude Quiz</span>
        </button>
        <button
          type="button"
          onclick={() => mode = 'procedural'}
          class="px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5
            {mode === 'procedural' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <span>⚡</span>
          <span>3. Procedural Archetype</span>
        </button>
      </div>

      <!-- Scrollable Body Content -->
      <div class="flex-1 overflow-y-auto p-5 space-y-6">

        <!-- General Identity -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div class="sm:col-span-2">
            <label for="char-name-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Character Name</label>
            <input
              id="char-name-input"
              type="text"
              bind:value={charName}
              placeholder="e.g. Torvald Ironheart"
              class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label for="char-level-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Level (1–20)</label>
            <select
              id="char-level-select"
              bind:value={charLevel}
              class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
            >
              {#each Array.from({ length: 20 }, (_, i) => i + 1) as lvl}
                <option value={lvl}>Level {lvl}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 1: PICK & ROLL
        ══════════════════════════════════════════════════════════════════════ -->
        {#if mode === 'pick_and_roll'}
          <!-- Method Selection -->
          <div class="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
            <span class="text-xs font-bold text-slate-300">Ability Generation:</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={() => { allocMethod = 'standard'; applyStandardArray(); }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors {allocMethod === 'standard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}"
              >
                Standard Array
              </button>
              <button
                type="button"
                onclick={() => { allocMethod = 'roller'; handleRollAllAttributes(); }}
                class="px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors {allocMethod === 'roller' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}"
              >
                🎲 4d6 Drop Lowest
              </button>
            </div>
          </div>

          <!-- Base Attributes Grid -->
          <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Base Ability Scores</span>
            <div class="grid grid-cols-6 gap-2">
              {#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as stat}
                {@const score = baseScores[stat as keyof typeof baseScores]}
                {@const mod = getMod(score)}
                <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-center">
                  <span class="text-[10px] font-mono uppercase text-slate-400 block font-bold">{stat}</span>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    bind:value={baseScores[stat as keyof typeof baseScores]}
                    class="w-full text-center text-base font-black bg-transparent text-slate-100 focus:outline-none"
                  />
                  <span class="text-[10px] font-mono text-indigo-400 font-bold block mt-0.5">
                    {mod >= 0 ? `+${mod}` : mod}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Race & Class Selection -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 5e SRD Race -->
            <div class="space-y-2">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5e SRD Race</span>
              <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {#each RACES as race}
                  <button
                    type="button"
                    onclick={() => selectedRace = race.name}
                    class="w-full text-left p-2.5 rounded-xl border transition-all {selectedRace === race.name ? 'bg-indigo-950/60 border-indigo-500/60 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'}"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold">{race.name}</span>
                      <span class="text-[10px] font-mono text-slate-500">{race.language}</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5">{race.bonusText}</p>
                  </button>
                {/each}
              </div>
            </div>

            <!-- 5e SRD Class -->
            <div class="space-y-2">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5e SRD Class</span>
              <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {#each CLASSES as cls}
                  <button
                    type="button"
                    onclick={() => selectedClass = cls.name}
                    class="w-full text-left p-2.5 rounded-xl border transition-all {selectedClass === cls.name ? 'bg-indigo-950/60 border-indigo-500/60 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'}"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold">{cls.name}</span>
                      <span class="text-[10px] font-mono text-emerald-400">d{cls.hitDie} HP</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5">{cls.armor} · {cls.weapon}</p>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Background Selection (Pick & Roll mode) -->
          <div>
            <label for="char-background-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">5e SRD Background</label>
            <select
              id="char-background-select"
              bind:value={selectedBackground}
              class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              {#each BACKGROUNDS as bg}
                <option value={bg}>{bg}</option>
              {/each}
            </select>
          </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 2: GUIDED APTITUDE QUIZ (10-QUESTION TRIAD ENGINE)
        ══════════════════════════════════════════════════════════════════════ -->
        {:else if mode === 'guided_quiz'}
          <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-5">
            <GuidedQuizBuilder
              characterName={charName}
              characterLevel={charLevel}
              onComplete={(char) => {
                if (onCharacterCreated) onCharacterCreated(char);
                isOpen = false;
              }}
            />
          </div>

        <!-- ═════════════════════════════════════════════════════════════════════
             MODE 3: PROCEDURAL GENERATOR (ONE-CLICK LEVEL 1-20 5E SRD ARCHETYPE)
        ══════════════════════════════════════════════════════════════════════ -->
        {:else if mode === 'procedural'}
          <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center mx-auto text-2xl">
              ⚡
            </div>
            <div>
              <h4 class="text-sm font-bold text-slate-100 uppercase tracking-wider">Instant 5e SRD Archetype (Level {charLevel})</h4>
              <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Procedurally generates a balanced Level {charLevel} 5e character with standard array, SRD race bonuses, class features, functional starting gear, and scaled HP.
              </p>
            </div>

            <button
              type="button"
              onclick={handleGenerateProcedural}
              class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black rounded-xl shadow-lg transition-all active:scale-95"
            >
              🎲 Roll 5e Archetype
            </button>

            {#if proceduralCharacter}
              <div class="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-left space-y-3 text-xs">
                <div class="flex items-center justify-between font-bold text-slate-200">
                  <span class="text-sm text-white">{proceduralCharacter.name}</span>
                  <span class="text-emerald-400">Level {proceduralCharacter.level} · {proceduralCharacter.race} · {proceduralCharacter.class}</span>
                </div>
                <div class="grid grid-cols-6 gap-2 text-center">
                  {#each [['STR', proceduralCharacter.str], ['DEX', proceduralCharacter.dex], ['CON', proceduralCharacter.con], ['INT', proceduralCharacter.int], ['WIS', proceduralCharacter.wis], ['CHA', proceduralCharacter.cha]] as [stat, val]}
                    <div class="bg-slate-950 p-1.5 rounded border border-slate-800">
                      <span class="text-[9px] text-slate-400 block font-bold">{stat}</span>
                      <span class="text-sm font-black text-white">{val}</span>
                    </div>
                  {/each}
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-2 font-mono">
                  <span>HP: <strong class="text-emerald-300">{proceduralCharacter.hpMax}</strong></span>
                  <span>AC: <strong class="text-sky-300">{proceduralCharacter.ac}</strong></span>
                  <span>Init: <strong class="text-amber-300">+{proceduralCharacter.initiativeMod} (DEX)</strong></span>
                  <span>Speed: <strong class="text-slate-200">{proceduralCharacter.speed} ft</strong></span>
                </div>
                <p class="text-slate-400 text-[11px] leading-relaxed">{proceduralCharacter.bio}</p>
              </div>
            {/if}
          </div>
        {/if}

      </div>

      <!-- Modal Footer -->
      <div class="h-16 bg-slate-950 border-t border-slate-800 px-5 flex items-center justify-between shrink-0">
        <div class="text-[11px] text-slate-400 font-mono">
          <span>Level {charLevel}</span> · <span>{selectedRace}</span> · <span>{selectedClass}</span>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            onclick={() => isOpen = false}
            class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Cancel
          </button>
          {#if mode !== 'guided_quiz'}
            <button
              type="button"
              onclick={handleFinalizeCreation}
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            >
              Create Character Sheet
            </button>
          {/if}
        </div>
      </div>

    </div>
  </div>
{/if}
