<!-- src/lib/components/character/GuidedQuizBuilder.svelte -->
<!-- 10-Question Guided Aptitude Quiz with Back / Reset and Automatic 5e SRD Generation -->
<script lang="ts">
  import {
    QUIZ_QUESTIONS_10,
    generateCharacterFromTally,
    type ArchetypeTriad,
    type CreatedCharacter
  } from '../../services/classQuizEngine';
  import { audioEngine } from '../../audio/AudioEngine';

  let {
    characterName = '',
    characterLevel = 1,
    onComplete
  }: {
    characterName: string;
    characterLevel: number;
    onComplete: (char: CreatedCharacter) => void;
  } = $props();

  let currentQuestionIndex = $state(0);
  let answers = $state<Record<number, ArchetypeTriad>>({});
  let resultCharacter = $state<CreatedCharacter | null>(null);

  const currentQ = $derived(QUIZ_QUESTIONS_10[currentQuestionIndex]);
  const isFinished = $derived(resultCharacter !== null);
  const progressPercent = $derived(
    Math.round(((currentQuestionIndex + 1) / QUIZ_QUESTIONS_10.length) * 100)
  );

  function handleSelectOption(archetype: ArchetypeTriad) {
    answers[currentQuestionIndex] = archetype;
    audioEngine.triggerSfx('sfx-dice-crit');

    if (currentQuestionIndex < QUIZ_QUESTIONS_10.length - 1) {
      currentQuestionIndex++;
    } else {
      finalizeQuiz();
    }
  }

  function handlePreviousQuestion() {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      resultCharacter = null;
    }
  }

  function handleResetAssessment() {
    currentQuestionIndex = 0;
    answers = {};
    resultCharacter = null;
  }

  function finalizeQuiz() {
    let combat = 0;
    let stealth = 0;
    let magic = 0;

    for (const val of Object.values(answers)) {
      if (val === 'combat') combat++;
      else if (val === 'stealth') stealth++;
      else if (val === 'magic') magic++;
    }

    resultCharacter = generateCharacterFromTally(
      characterName || 'Hero of the Realm',
      characterLevel,
      { combat, stealth, magic }
    );
  }

  function handleAcceptCharacter() {
    if (resultCharacter) {
      onComplete(resultCharacter);
    }
  }
</script>

<div class="flex flex-col h-full space-y-4">
  {#if !isFinished}
    <!-- Assessment Header & Controls -->
    <div class="flex items-center justify-between pb-3 border-b border-slate-800">
      <div>
        <span class="text-xs font-black tracking-widest text-indigo-400 uppercase">
          Tactical Aptitude Dilemma {currentQuestionIndex + 1} of {QUIZ_QUESTIONS_10.length}
        </span>
        <h3 class="text-sm font-bold text-slate-200 mt-0.5">
          Level {characterLevel} Assessment for "{characterName || 'Unnamed Hero'}"
        </h3>
      </div>

      <!-- Navigation & Reset -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handlePreviousQuestion}
          disabled={currentQuestionIndex === 0}
          class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          ← Previous Question
        </button>
        <button
          type="button"
          onclick={handleResetAssessment}
          class="px-2.5 py-1 text-xs font-semibold rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800/50 text-rose-300 transition-all"
        >
          ↺ Reset Assessment
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
      <div
        class="bg-gradient-to-r from-indigo-500 to-teal-400 h-full transition-all duration-300"
        style="width: {progressPercent}%"
      ></div>
    </div>

    <!-- Scenario Presentation -->
    <div class="p-4 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner">
      <p class="text-sm font-medium text-slate-200 leading-relaxed italic">
        "{currentQ.scenario}"
      </p>
    </div>

    <!-- Option Cards -->
    <div class="space-y-2.5 flex-1 overflow-y-auto">
      {#each currentQ.options as opt, idx}
        <button
          type="button"
          onclick={() => handleSelectOption(opt.archetype)}
          class="w-full text-left p-3.5 rounded-xl border transition-all text-xs flex flex-col gap-1 {answers[currentQuestionIndex] === opt.archetype ? 'bg-indigo-950/60 border-indigo-500 text-indigo-100 shadow-lg' : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-800/80'}"
        >
          <div class="flex items-center justify-between font-bold text-slate-100">
            <span class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                {idx + 1}
              </span>
              <span>{opt.text}</span>
            </span>
            <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {opt.archetype}
            </span>
          </div>
          <span class="text-[11px] text-slate-400 pl-7">{opt.flavor}</span>
        </button>
      {/each}
    </div>

    <!-- Dynamic Progress Footer -->
    <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
      <span>Question {currentQuestionIndex + 1} of {QUIZ_QUESTIONS_10.length}</span>
      <span class="text-indigo-400">{progressPercent}% complete · Archetype revealed upon submission</span>
    </div>
  {:else if resultCharacter}
    <!-- Assessment Outcome Screen -->
    <div class="flex-1 flex flex-col justify-between space-y-4 animate-in fade-in duration-300">
      <div class="p-5 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-slate-950 border border-indigo-500/30 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-[10px] font-black tracking-widest text-indigo-400 uppercase">Assessment Complete</span>
            <h3 class="text-lg font-black text-slate-100">
              {resultCharacter.name}
            </h3>
            <p class="text-xs text-indigo-300">
              Level {resultCharacter.level} · {resultCharacter.race} · {resultCharacter.class} · {resultCharacter.background}
            </p>
          </div>
          <div class="text-right">
            <div class="text-xs font-bold text-emerald-400">Max HP: {resultCharacter.hpMax}</div>
            <div class="text-xs font-bold text-sky-400">Functional AC: {resultCharacter.ac}</div>
            <div class="text-xs font-mono text-slate-400">Init: +{resultCharacter.initiativeMod} (DEX)</div>
          </div>
        </div>

        <!-- Ability Scores Grid -->
        <div class="grid grid-cols-6 gap-2 text-center pt-2">
          {#each [['STR', resultCharacter.str], ['DEX', resultCharacter.dex], ['CON', resultCharacter.con], ['INT', resultCharacter.int], ['WIS', resultCharacter.wis], ['CHA', resultCharacter.cha]] as [stat, val]}
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
              <div class="text-[10px] font-bold text-slate-400">{stat}</div>
              <div class="text-base font-black text-white">{val}</div>
              <div class="text-[10px] text-indigo-400 font-mono">
                {Math.floor((Number(val) - 10) / 2) >= 0 ? `+${Math.floor((Number(val) - 10) / 2)}` : Math.floor((Number(val) - 10) / 2)}
              </div>
            </div>
          {/each}
        </div>

        <!-- Gear & Background Features -->
        <div class="grid grid-cols-2 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Equipped Standard Gear</span>
            <div class="text-slate-200">⚔️ {resultCharacter.weaponName}</div>
            <div class="text-slate-200">🛡️ {resultCharacter.armorName} (Functional)</div>
          </div>
          <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Background Proficiencies</span>
            <div class="text-slate-300">{resultCharacter.skills.join(', ')}</div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-800">
        <button
          type="button"
          onclick={handleResetAssessment}
          class="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
        >
          ↺ Retake Assessment
        </button>
        <button
          type="button"
          onclick={handleAcceptCharacter}
          class="px-5 py-2 text-xs font-black rounded-xl bg-gradient-to-r from-indigo-500 to-teal-400 hover:from-indigo-400 hover:to-teal-300 text-slate-950 shadow-lg transition-all"
        >
          ✓ Spawn &amp; Save Character
        </button>
      </div>
    </div>
  {/if}
</div>
