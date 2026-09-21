<!-- src/lib/components/downtime/DowntimeManager.svelte -->
<!-- Standard 5e SRD Downtime Activity Manager with Gold Deductions & Activity Logging -->
<script lang="ts">
  import { audioEngine } from '../../audio/AudioEngine';

  export interface DowntimeLogEntry {
    id: string;
    timestamp: number;
    activityType: 'crafting' | 'researching' | 'recuperating' | 'training' | 'carousing';
    daysSpent: number;
    goldCost: number;
    outcomeText: string;
  }

  let {
    characterName = 'Adventurer',
    characterGold = $bindable(100),
    isOpen = $bindable(false),
    onGoldChange,
    onLogActivity
  }: {
    characterName?: string;
    characterGold?: number;
    isOpen?: boolean;
    onGoldChange?: (newGold: number) => void;
    onLogActivity?: (log: DowntimeLogEntry) => void;
  } = $props();

  type ActivityTab = 'crafting' | 'researching' | 'recuperating' | 'training' | 'carousing' | 'log';
  let activeTab = $state<ActivityTab>('crafting');

  // Activity Logs
  let activityLogs = $state<DowntimeLogEntry[]>([]);

  // 1. Crafting State (5 gp / workday)
  let craftItemName = $state('Potion of Healing');
  let craftMarketCost = $state(50); // gp
  let craftDaysInvested = $state(0);
  let craftDaysToAdd = $state(1);

  const craftDaysRequired = $derived(Math.ceil(craftMarketCost / 5));
  const craftProgressPercent = $derived(
    Math.min(100, Math.round((craftDaysInvested / Math.max(1, craftDaysRequired)) * 100))
  );

  // 2. Researching State (1 day + 50 gp per check)
  let researchTopic = $state('Ancient Arcane Ruins of the Vale');
  let researchDays = $state(1);
  let researchResult = $state<string | null>(null);

  // 3. Recuperating State (3 days rest to end affliction)
  let recuperateDays = $state(3);
  let afflictionName = $state('Sewer Plague / Venomous Poison');
  let recuperateStatus = $state<string | null>(null);

  // 4. Training State (250 days at 1 gp/day)
  let trainingSubject = $state("Thieves' Tools");
  let trainingDaysInvested = $state(45);
  let trainingDaysToAdd = $state(5);
  const trainingDaysRequired = 250;
  const trainingProgressPercent = $derived(
    Math.min(100, Math.round((trainingDaysInvested / trainingDaysRequired) * 100))
  );

  // 5. Carousing / Work State
  let carouseLifestyle = $state<'modest' | 'comfortable' | 'wealthy'>('comfortable');
  let carouseDays = $state(3);
  let carouseRumorResult = $state<string | null>(null);

  function deductGold(amount: number): boolean {
    if (characterGold < amount) {
      alert(`Insufficient gold! Requires ${amount} gp, but you only have ${characterGold} gp.`);
      return false;
    }
    characterGold -= amount;
    if (onGoldChange) onGoldChange(characterGold);
    return true;
  }

  function addLog(entry: DowntimeLogEntry) {
    activityLogs = [entry, ...activityLogs];
    if (onLogActivity) onLogActivity(entry);
  }

  // --- Actions ---

  function handlePerformCrafting() {
    const costPerDay = 2.5; // Raw material cost is half the 5 gp daily output
    const totalMaterialCost = Math.round(costPerDay * craftDaysToAdd * 10) / 10;

    if (!deductGold(totalMaterialCost)) return;

    craftDaysInvested += craftDaysToAdd;
    const isComplete = craftDaysInvested >= craftDaysRequired;

    audioEngine.triggerSfx('sfx-rest');
    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      activityType: 'crafting',
      daysSpent: craftDaysToAdd,
      goldCost: totalMaterialCost,
      outcomeText: isComplete
        ? `Completed crafting "${craftItemName}"! Item added to inventory.`
        : `Invested ${craftDaysToAdd} day(s) crafting "${craftItemName}" (${craftDaysInvested}/${craftDaysRequired} days). Spent ${totalMaterialCost} gp in materials.`
    });

    if (isComplete) {
      craftDaysInvested = 0;
    }
  }

  function handlePerformResearch() {
    const goldCost = researchDays * 50;
    if (!deductGold(goldCost)) return;

    // Roll Intelligence (Investigation) check
    const d20 = Math.floor(Math.random() * 20) + 1;
    const intMod = 3;
    const checkTotal = d20 + intMod;

    let loreClue = '';
    if (checkTotal >= 20) {
      loreClue = `Critical Breakthrough [${checkTotal}]: You uncovered two legendary true facts regarding "${researchTopic}".`;
    } else if (checkTotal >= 15) {
      loreClue = `Substantial Success [${checkTotal}]: You discovered key historic documents and a detailed map concerning "${researchTopic}".`;
    } else if (checkTotal >= 10) {
      loreClue = `Basic Insight [${checkTotal}]: You gathered common rumors and one verified lead regarding "${researchTopic}".`;
    } else {
      loreClue = `Inconclusive [${checkTotal}]: The archives were sparse or contradicted each other. No new clues discovered.`;
    }

    researchResult = loreClue;
    audioEngine.triggerSfx('sfx-secret');

    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      activityType: 'researching',
      daysSpent: researchDays,
      goldCost,
      outcomeText: `Researched "${researchTopic}" for ${researchDays} day(s) (Cost: ${goldCost} gp). ${loreClue}`
    });
  }

  function handlePerformRecuperation() {
    const goldCost = recuperateDays * 1; // 1 gp per day modest lifestyle
    if (!deductGold(goldCost)) return;

    // DC 15 Constitution save to recover
    const d20 = Math.floor(Math.random() * 20) + 1;
    const conMod = 2;
    const total = d20 + conMod;
    const success = total >= 15;

    if (success) {
      recuperateStatus = `Full Recovery [Save: ${total} vs DC 15]: You have shaken off "${afflictionName}" and removed all lingering effects!`;
    } else {
      recuperateStatus = `Slow Mending [Save: ${total} vs DC 15]: The symptoms remain, but you have advantage on all further saves against this affliction.`;
    }

    audioEngine.triggerSfx('sfx-rest');
    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      activityType: 'recuperating',
      daysSpent: recuperateDays,
      goldCost,
      outcomeText: `Spent ${recuperateDays} days recuperating from "${afflictionName}". Result: ${recuperateStatus}`
    });
  }

  function handlePerformTraining() {
    const goldCost = trainingDaysToAdd * 1; // 1 gp per day for tutor/materials
    if (!deductGold(goldCost)) return;

    trainingDaysInvested += trainingDaysToAdd;
    const isComplete = trainingDaysInvested >= trainingDaysRequired;

    audioEngine.triggerSfx('sfx-bell');
    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      activityType: 'training',
      daysSpent: trainingDaysToAdd,
      goldCost,
      outcomeText: isComplete
        ? `Mastered training! Gained official proficiency in "${trainingSubject}"!`
        : `Trained in "${trainingSubject}" for ${trainingDaysToAdd} day(s) (${trainingDaysInvested}/${trainingDaysRequired} days completed).`
    });

    if (isComplete) {
      trainingDaysInvested = 0;
    }
  }

  function handlePerformCarousing() {
    const costMap = { modest: 1, comfortable: 2, wealthy: 4 };
    const dailyCost = costMap[carouseLifestyle];
    const goldCost = carouseDays * dailyCost;

    if (!deductGold(goldCost)) return;

    const rumors = [
      'Overheard at the tavern: The local guard captain is secretly indebted to the Black Moon syndicate.',
      'A drunken merchant claims a forgotten vault lies below the harbor warehouse district.',
      'Temple acolytes are whispering that the high priest has gone missing after entering the catacombs.',
      'A wandering ranger saw strange lights and ritual chanting along the northern barrows at dusk.',
      'A bounty of 200 gp has been quietly placed on an escaped chimera beast stalking the pass.'
    ];
    const rumor = rumors[Math.floor(Math.random() * rumors.length)];
    carouseRumorResult = rumor;

    audioEngine.triggerSfx('sfx-dice-crit');
    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      activityType: 'carousing',
      daysSpent: carouseDays,
      goldCost,
      outcomeText: `Caroused in town for ${carouseDays} day(s) under ${carouseLifestyle} lifestyle (Cost: ${goldCost} gp). Rumor gained: "${rumor}"`
    });
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <!-- Modal Card -->
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
      
      <!-- Header -->
      <div class="h-14 bg-slate-950/90 border-b border-slate-800 px-5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">⏳</span>
          <div>
            <h2 class="text-sm font-bold text-slate-100 uppercase tracking-wider">
              5e SRD Downtime Activities
            </h2>
            <p class="text-[10px] text-slate-400">
              {characterName} · Campaign Calendar &amp; Resource Manager
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-600/50 text-amber-300 font-mono font-bold text-xs">
            💰 {characterGold} GP
          </div>
          <button
            type="button"
            onclick={() => isOpen = false}
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="bg-slate-950 border-b border-slate-800 px-4 flex items-center gap-1 shrink-0 overflow-x-auto">
        {#each [
          { id: 'crafting', label: 'Crafting', icon: '🔨' },
          { id: 'researching', label: 'Research', icon: '📜' },
          { id: 'recuperating', label: 'Recuperation', icon: '🌿' },
          { id: 'training', label: 'Training', icon: '🥋' },
          { id: 'carousing', label: 'Carousing', icon: '🍻' },
          { id: 'log', label: 'History Log', icon: '📖' }
        ] as tab}
          <button
            type="button"
            onclick={() => activeTab = tab.id as ActivityTab}
            class="px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 {activeTab === tab.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>

      <!-- Scrollable Content Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        
        <!-- 1. CRAFTING -->
        {#if activeTab === 'crafting'}
          <div class="space-y-4">
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <strong class="text-amber-300">5e SRD Crafting Rule:</strong> An adventurer can craft nonmagical items or basic potions at a rate of <strong>5 gp per work day</strong>. Raw materials cost half the item's market value.
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="craft-item-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Item to Craft</label>
                <input
                  id="craft-item-input"
                  type="text"
                  bind:value={craftItemName}
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                />
              </div>
              <div>
                <label for="craft-cost-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Market Cost (GP)</label>
                <input
                  id="craft-cost-input"
                  type="number"
                  min="1"
                  bind:value={craftMarketCost}
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                />
              </div>
            </div>

            <!-- Progress Tracker -->
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-300">Progress Towards Completion</span>
                <span class="font-mono text-amber-400 font-bold">{craftDaysInvested} / {craftDaysRequired} Days ({craftProgressPercent}%)</span>
              </div>
              <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="bg-amber-500 h-full transition-all duration-300" style="width: {craftProgressPercent}%"></div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2">
              <div class="flex items-center gap-2">
                <label for="craft-days-add" class="text-xs text-slate-400">Work Days:</label>
                <input
                  id="craft-days-add"
                  type="number"
                  min="1"
                  max="30"
                  bind:value={craftDaysToAdd}
                  class="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono text-center"
                />
                <span class="text-xs text-slate-400">(Material Cost: <strong>{craftDaysToAdd * 2.5} gp</strong>)</span>
              </div>
              <button
                type="button"
                onclick={handlePerformCrafting}
                class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow transition-all active:scale-95"
              >
                🔨 Spend Days &amp; Craft
              </button>
            </div>
          </div>

        <!-- 2. RESEARCH -->
        {:else if activeTab === 'researching'}
          <div class="space-y-4">
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <strong class="text-amber-300">5e SRD Research Rule:</strong> Delving into arcane grimoires or grand archives requires <strong>50 gp per day</strong> for materials and bribes. Make an Intelligence (Investigation) check to discover hidden lore.
            </div>

            <div>
              <label for="research-topic-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Subject / Question</label>
              <input
                id="research-topic-input"
                type="text"
                bind:value={researchTopic}
                class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <label for="research-days-input" class="text-xs text-slate-400">Days to Spend:</label>
                <input
                  id="research-days-input"
                  type="number"
                  min="1"
                  max="10"
                  bind:value={researchDays}
                  class="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono text-center"
                />
                <span class="text-xs text-slate-400">(Cost: <strong>{researchDays * 50} gp</strong>)</span>
              </div>
              <button
                type="button"
                onclick={handlePerformResearch}
                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-all active:scale-95"
              >
                📜 Conduct Research
              </button>
            </div>

            {#if researchResult}
              <div class="p-4 bg-indigo-950/50 border border-indigo-500/40 rounded-xl text-xs space-y-1">
                <span class="font-black text-indigo-300 uppercase tracking-wider block">Archive Discovery</span>
                <p class="text-slate-200">{researchResult}</p>
              </div>
            {/if}
          </div>

        <!-- 3. RECUPERATING -->
        {:else if activeTab === 'recuperating'}
          <div class="space-y-4">
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <strong class="text-amber-300">5e SRD Recuperating Rule:</strong> Spend <strong>3 days of bed rest</strong> to recover from debilitating diseases or poisons. Make a DC 15 Constitution saving throw to end the affliction.
            </div>

            <div>
              <label for="affliction-name-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Affliction</label>
              <input
                id="affliction-name-input"
                type="text"
                bind:value={afflictionName}
                class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400">Duration: 3 Days · Modest Living: <strong>3 gp</strong></span>
              <button
                type="button"
                onclick={handlePerformRecuperation}
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow transition-all active:scale-95"
              >
                🌿 Rest &amp; Recuperate
              </button>
            </div>

            {#if recuperateStatus}
              <div class="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs space-y-1">
                <span class="font-black text-emerald-300 uppercase tracking-wider block">Recuperation Outcome</span>
                <p class="text-slate-200">{recuperateStatus}</p>
              </div>
            {/if}
          </div>

        <!-- 4. TRAINING -->
        {:else if activeTab === 'training'}
          <div class="space-y-4">
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <strong class="text-amber-300">5e SRD Training Rule:</strong> You can spend time between adventures learning a new language or training with a tool. Training typically takes <strong>250 days and costs 1 gp per day</strong>.
            </div>

            <div>
              <label for="training-sub-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Proficiency Goal</label>
              <input
                id="training-sub-input"
                type="text"
                bind:value={trainingSubject}
                class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            <!-- Training Progress Bar -->
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-300">Training Mastery</span>
                <span class="font-mono text-cyan-400 font-bold">{trainingDaysInvested} / {trainingDaysRequired} Days ({trainingProgressPercent}%)</span>
              </div>
              <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="bg-cyan-500 h-full transition-all duration-300" style="width: {trainingProgressPercent}%"></div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2">
              <div class="flex items-center gap-2">
                <label for="training-days-add" class="text-xs text-slate-400">Days to Train:</label>
                <input
                  id="training-days-add"
                  type="number"
                  min="1"
                  max="50"
                  bind:value={trainingDaysToAdd}
                  class="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono text-center"
                />
                <span class="text-xs text-slate-400">(Tutor Cost: <strong>{trainingDaysToAdd} gp</strong>)</span>
              </div>
              <button
                type="button"
                onclick={handlePerformTraining}
                class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs rounded-xl shadow transition-all active:scale-95"
              >
                🥋 Train Skill
              </button>
            </div>
          </div>

        <!-- 5. CAROUSING -->
        {:else if activeTab === 'carousing'}
          <div class="space-y-4">
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <strong class="text-amber-300">5e SRD Carousing Rule:</strong> Spend days mingling in taverns, socializing with locals, and buying rounds of drinks to uncover rumors and develop contacts.
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="carouse-lifestyle-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Lifestyle Level</label>
                <select
                  id="carouse-lifestyle-select"
                  bind:value={carouseLifestyle}
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="modest">Modest (1 gp/day)</option>
                  <option value="comfortable">Comfortable (2 gp/day)</option>
                  <option value="wealthy">Wealthy (4 gp/day)</option>
                </select>
              </div>
              <div>
                <label for="carouse-days-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Days Carousing</label>
                <input
                  id="carouse-days-input"
                  type="number"
                  min="1"
                  max="14"
                  bind:value={carouseDays}
                  class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                />
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                onclick={handlePerformCarousing}
                class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow transition-all active:scale-95"
              >
                🍻 Spend Nights &amp; Seek Rumors
              </button>
            </div>

            {#if carouseRumorResult}
              <div class="p-4 bg-amber-950/40 border border-amber-600/40 rounded-xl text-xs space-y-1">
                <span class="font-black text-amber-300 uppercase tracking-wider block">Rumor Uncovered</span>
                <p class="text-slate-200 leading-relaxed italic">"{carouseRumorResult}"</p>
              </div>
            {/if}
          </div>

        <!-- 6. LOG -->
        {:else if activeTab === 'log'}
          <div class="space-y-2">
            {#if activityLogs.length === 0}
              <div class="text-center py-8 text-slate-500 text-xs">
                No downtime activities logged yet. Activities performed above will be cataloged here.
              </div>
            {:else}
              {#each activityLogs as entry}
                <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                  <div class="flex items-center justify-between text-[10px] text-slate-400">
                    <span class="uppercase font-bold text-amber-400 font-mono">{entry.activityType}</span>
                    <span>{entry.daysSpent} Days · Spent {entry.goldCost} GP</span>
                  </div>
                  <p class="text-slate-200">{entry.outcomeText}</p>
                </div>
              {/each}
            {/if}
          </div>
        {/if}

      </div>
    </div>
  </div>
{/if}
