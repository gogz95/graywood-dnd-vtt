<script lang="ts">
  // src/lib/components/player/PetManagerDrawer.svelte
  // Mount, Beast & Familiar Manager with carrying capacity and feed rations tracking

  import type { CompanionAnimal } from '../../types/character';

  let {
    companions = $bindable([]),
    onFeedAnimal,
    onRollMorale
  }: {
    companions?: CompanionAnimal[];
    onFeedAnimal?: (animalId: string) => void;
    onRollMorale?: (animal: CompanionAnimal, rollResult: { d20: number; total: number; success: boolean }) => void;
  } = $props();

  let activeTab = $state<'list' | 'add'>('list');
  let selectedAnimalId = $state<string | null>(null);

  // New Companion Form State
  let newName = $state('');
  let newSpecies = $state('Mule');
  let newType = $state<'mount' | 'beast' | 'familiar' | 'pack_animal'>('pack_animal');
  let newHp = $state(11);
  let newAc = $state(10);
  let newSpeed = $state(40);
  let newStr = $state(14);
  let newIsBeastOfBurden = $state(true);

  function calculateCapacity(strScore: number, isBeastOfBurden: boolean): number {
    return strScore * 15 * (isBeastOfBurden ? 2 : 1);
  }

  function handleCreateAnimal() {
    if (!newName.trim()) return;
    const capacity = calculateCapacity(newStr, newIsBeastOfBurden);
    const companion: CompanionAnimal = {
      id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      species: newSpecies.trim(),
      type: newType,
      currentHp: newHp,
      maxHp: newHp,
      ac: newAc,
      speed: newSpeed,
      str: newStr,
      cargoWeight: 0,
      capacityLbs: capacity,
      feedDaysRemaining: 7,
      isBeastOfBurden: newIsBeastOfBurden,
      conditions: []
    };
    companions = [...companions, companion];
    newName = '';
    activeTab = 'list';
  }

  function feedOneDay(animal: CompanionAnimal) {
    animal.feedDaysRemaining = animal.feedDaysRemaining + 1;
    if (onFeedAnimal) onFeedAnimal(animal.id);
  }

  function triggerMoraleCheck(animal: CompanionAnimal) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const wisMod = Math.floor((10 - 10) / 2); // default DC 10 base check
    const total = d20 + wisMod;
    const success = total >= 10;
    if (onRollMorale) {
      onRollMorale(animal, { d20, total, success });
    }
  }

  function adjustHp(animal: CompanionAnimal, delta: number) {
    animal.currentHp = Math.max(0, Math.min(animal.maxHp, animal.currentHp + delta));
  }
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg text-slate-100">
  <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
    <div class="flex items-center gap-2">
      <span class="text-lg">🐎</span>
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Mounts, Beasts &amp; Familiars</h3>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
        {companions.length}
      </span>
    </div>

    <div class="flex items-center gap-1 text-xs">
      <button
        onclick={() => activeTab = 'list'}
        class="px-2 py-1 rounded font-semibold transition-colors {activeTab === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
      >
        Roster
      </button>
      <button
        onclick={() => activeTab = 'add'}
        class="px-2 py-1 rounded font-semibold transition-colors {activeTab === 'add' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
      >
        + Add Beast
      </button>
    </div>
  </div>

  {#if activeTab === 'add'}
    <!-- Add Companion Form -->
    <div class="space-y-3 text-xs">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="pet-name-input" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Name</label>
          <input
            id="pet-name-input"
            type="text"
            bind:value={newName}
            placeholder="e.g. Barnaby"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-bold focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label for="pet-species-input" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Species</label>
          <input
            id="pet-species-input"
            type="text"
            bind:value={newSpecies}
            placeholder="e.g. Warhorse, Mule, Raven"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div>
          <label for="pet-type-select" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Role / Type</label>
          <select
            id="pet-type-select"
            bind:value={newType}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
          >
            <option value="pack_animal">Pack Animal</option>
            <option value="mount">Riding Mount</option>
            <option value="beast">Combat Beast</option>
            <option value="familiar">Familiar</option>
          </select>
        </div>
        <div>
          <label for="pet-hp-input" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Max HP</label>
          <input
            id="pet-hp-input"
            type="number"
            min="1"
            bind:value={newHp}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
          />
        </div>
        <div>
          <label for="pet-str-input" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">STR Score</label>
          <input
            id="pet-str-input"
            type="number"
            min="1"
            bind:value={newStr}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <input
          id="pet-burden-check"
          type="checkbox"
          bind:checked={newIsBeastOfBurden}
          class="rounded accent-indigo-500"
        />
        <label for="pet-burden-check" class="text-slate-300 font-semibold cursor-pointer">
          Beast of Burden (Doubles Carrying Capacity to 30 × STR lbs)
        </label>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          onclick={() => activeTab = 'list'}
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
        >
          Cancel
        </button>
        <button
          onclick={handleCreateAnimal}
          disabled={!newName.trim()}
          class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold shadow"
        >
          Add Companion
        </button>
      </div>
    </div>
  {:else}
    <!-- Companion List View -->
    {#if companions.length === 0}
      <div class="py-6 text-center text-slate-500 text-xs">
        No active pack animals or mounts registered. Click "+ Add Beast" to register your traveling companions.
      </div>
    {:else}
      <div class="space-y-3">
        {#each companions as animal (animal.id)}
          {@const loadPct = Math.min(100, Math.round((animal.cargoWeight / (animal.capacityLbs || 1)) * 100))}
          <div class="bg-slate-950 border border-slate-800/80 rounded-lg p-3 hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-sm text-slate-100">{animal.name}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 uppercase">
                    {animal.species}
                  </span>
                  <span class="text-[10px] text-slate-500 uppercase font-mono">
                    {animal.type.replace('_', ' ')}
                  </span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                  <span>AC: <strong class="text-slate-200 font-mono">{animal.ac}</strong></span>
                  <span>Speed: <strong class="text-slate-200 font-mono">{animal.speed} ft</strong></span>
                  <span>STR: <strong class="text-slate-200 font-mono">{animal.str}</strong></span>
                </div>
              </div>

              <!-- HP Badges & Controls -->
              <div class="flex items-center gap-1.5">
                <button
                  onclick={() => adjustHp(animal, -1)}
                  class="w-5 h-5 bg-slate-800 hover:bg-rose-900/60 text-slate-300 rounded flex items-center justify-center font-bold text-xs"
                  title="Damage -1"
                >
                  -
                </button>
                <div class="px-2 py-0.5 rounded font-mono font-bold text-xs border {animal.currentHp <= 0 ? 'bg-rose-950 text-rose-300 border-rose-700' : 'bg-slate-900 text-slate-200 border-slate-700'}">
                  {animal.currentHp} / {animal.maxHp} HP
                </div>
                <button
                  onclick={() => adjustHp(animal, 1)}
                  class="w-5 h-5 bg-slate-800 hover:bg-emerald-900/60 text-slate-300 rounded flex items-center justify-center font-bold text-xs"
                  title="Heal +1"
                >
                  +
                </button>
              </div>
            </div>

            <!-- Pack Cargo Load Bar -->
            <div class="mb-2">
              <div class="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400 mb-1">
                <span>Pack Cargo Load</span>
                <span class="font-mono {loadPct >= 100 ? 'text-rose-400' : 'text-slate-300'}">
                  {animal.cargoWeight} / {animal.capacityLbs} lbs ({loadPct}%)
                </span>
              </div>
              <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  class="h-full transition-all duration-300 rounded-full {loadPct >= 100 ? 'bg-rose-500' : loadPct >= 75 ? 'bg-amber-500' : 'bg-indigo-500'}"
                  style="width: {loadPct}%;"
                ></div>
              </div>
            </div>

            <!-- Feed Tracker & Quick Actions -->
            <div class="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
              <div class="flex items-center gap-1 text-[11px]">
                <span class="text-slate-500">Rations:</span>
                <span class="font-mono font-bold {animal.feedDaysRemaining <= 1 ? 'text-rose-400' : 'text-emerald-400'}">
                  {animal.feedDaysRemaining} days
                </span>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  onclick={() => feedOneDay(animal)}
                  class="px-2 py-1 bg-slate-800 hover:bg-emerald-800 text-slate-200 hover:text-emerald-100 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                  title="Spend 1 ration to feed for 1 day"
                >
                  <span>🌾</span>
                  <span>Feed (1d)</span>
                </button>

                <button
                  onclick={() => triggerMoraleCheck(animal)}
                  class="px-2 py-1 bg-slate-800 hover:bg-amber-800 text-slate-200 hover:text-amber-100 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                  title="Roll d20 Morale Check against panic/fleeing"
                >
                  <span>🎲</span>
                  <span>Morale Check</span>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
