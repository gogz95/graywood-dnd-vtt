<script lang="ts">
  import { onMount } from 'svelte';
  import {
    importCompendiumJson,
    getCompendiumEntities,
    deleteCompendiumEntity,
    clearCompendiumStore,
    type CompendiumEntity
  } from '../../importers/compendiumImporter';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let searchQuery = $state('');
  let selectedCategory = $state<'all' | 'creature' | 'spell' | 'item'>('all');
  let entities = $state<CompendiumEntity[]>([]);
  let isLoading = $state(false);
  let showImportModal = $state(false);
  let importFeedback = $state<string | null>(null);
  let selectedEntity = $state<CompendiumEntity | null>(null);
  let actionToast = $state<string | null>(null);

  // Default SRD Seed Entities so compendium is immediately useful out of the box
  const SRD_SEEDS: CompendiumEntity[] = [
    {
      id: 'srd-goblin',
      name: 'Goblin',
      type: 'creature',
      size: 'Small',
      creatureType: 'humanoid (goblinoid)',
      alignment: 'neutral evil',
      cr: 0.25,
      ac: 15,
      hp: 7,
      speed: '30 ft.',
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' }],
      actions: [
        { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
        { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' }
      ],
      description: 'Small, black-hearted humanoids that lair in despoiled dungeons and other dismal settings.',
      source: 'srd'
    },
    {
      id: 'srd-orc',
      name: 'Orc',
      type: 'creature',
      size: 'Medium',
      creatureType: 'humanoid (orc)',
      alignment: 'chaotic evil',
      cr: 0.5,
      ac: 13,
      hp: 15,
      speed: '30 ft.',
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      traits: [{ name: 'Aggressive', desc: 'As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.' }],
      actions: [{ name: 'Greataxe', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' }],
      description: 'Fierce warriors who revere the god of slaughter and plunder civilized lands.',
      source: 'srd'
    },
    {
      id: 'srd-ogre',
      name: 'Ogre',
      type: 'creature',
      size: 'Large',
      creatureType: 'giant',
      alignment: 'chaotic evil',
      cr: 2,
      ac: 11,
      hp: 59,
      speed: '40 ft.',
      str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
      actions: [{ name: 'Greatclub', desc: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) bludgeoning damage.' }],
      description: 'Gluttonous giants known for temper tantrums and wielding tree-trunk clubs.',
      source: 'srd'
    },
    {
      id: 'srd-fireball',
      name: 'Fireball',
      type: 'spell',
      level: 3,
      school: 'Evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M (a tiny ball of bat guano and sulfur)',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much on a successful one.',
      source: 'srd'
    },
    {
      id: 'srd-cure-wounds',
      name: 'Cure Wounds',
      type: 'spell',
      level: 1,
      school: 'Abjuration',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.',
      source: 'srd'
    },
    {
      id: 'srd-shield',
      name: 'Shield',
      type: 'spell',
      level: 1,
      school: 'Abjuration',
      castingTime: '1 reaction',
      range: 'Self',
      components: 'V, S',
      duration: '1 round',
      description: 'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against triggering attack, and you take no damage from magic missile.',
      source: 'srd'
    },
    {
      id: 'srd-potion-healing',
      name: 'Potion of Healing',
      type: 'item',
      category: 'Potion',
      rarity: 'Common',
      cost: '50 gp',
      weight: 0.5,
      description: 'You regain 2d4 + 2 hit points when you drink this potion. The potion\'s red liquid glimmers when agitated.',
      source: 'srd'
    },
    {
      id: 'srd-bag-of-holding',
      name: 'Bag of Holding',
      type: 'item',
      category: 'Wondrous Item',
      rarity: 'Uncommon',
      cost: '500 gp',
      weight: 15.0,
      description: 'This bag has an interior space considerably larger than its outside dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet.',
      source: 'srd'
    },
    {
      id: 'srd-sunforged-sword',
      name: 'Sunforged Longsword',
      type: 'item',
      category: 'Weapon (Martial)',
      rarity: 'Rare',
      cost: '1500 gp',
      weight: 3.0,
      description: 'Versatile (1d8/1d10). You gain a +1 bonus to attack and damage rolls made with this magic weapon. Sheds bright light in a 15-foot radius.',
      source: 'srd'
    }
  ];

  async function loadAllEntities() {
    isLoading = true;
    try {
      const imported = await getCompendiumEntities();
      entities = [...SRD_SEEDS, ...imported];
    } catch {
      entities = [...SRD_SEEDS];
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadAllEntities();
  });

  $effect(() => {
    if (isOpen) {
      loadAllEntities();
    }
  });

  let filteredEntities = $derived(
    entities.filter(item => {
      const matchCat = selectedCategory === 'all' || item.type === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.creatureType && item.creatureType.toLowerCase().includes(q)) ||
        (item.school && item.school.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    })
  );

  async function handleFileUpload(file: File) {
    importFeedback = null;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importCompendiumJson(parsed);

      audioEngine.triggerSfx('sfx-secret');
      importFeedback = `Successfully imported ${res.added} entities from ${file.name}!`;
      await loadAllEntities();
      setTimeout(() => {
        showImportModal = false;
        importFeedback = null;
      }, 2000);
    } catch (err: any) {
      importFeedback = `Error parsing ${file.name}: ${err.message || 'Invalid JSON format'}`;
    }
  }

  function handleAddToCombat(entity: CompendiumEntity) {
    sessionStore.addMonsterToCombat({
      name: entity.name,
      hp: entity.hp,
      ac: entity.ac,
      cr: entity.cr,
      description: entity.description,
    });
    audioEngine.triggerSfx('sfx-combat');
    actionToast = `Spawned ${entity.name} into active combat!`;
    setTimeout(() => { actionToast = null; }, 3000);
  }

  function handleSendToStash(entity: CompendiumEntity) {
    sessionStore.addItemToPartyStash({
      name: entity.name,
      category: entity.category || 'Gear',
      quantity: 1,
      weight: entity.weight || 1.0,
      description: entity.description,
    });
    audioEngine.triggerSfx('sfx-bell');
    actionToast = `Sent ${entity.name} to Party Stash!`;
    setTimeout(() => { actionToast = null; }, 3000);
  }

  async function handleDeleteEntity(id: string) {
    await deleteCompendiumEntity(id);
    await loadAllEntities();
    if (selectedEntity?.id === id) selectedEntity = null;
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <div class="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">

      <!-- Header -->
      <div class="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-lg">🏛️</div>
          <div>
            <h2 class="text-base font-black text-slate-100 uppercase tracking-wide">5e SRD Compendium</h2>
            <p class="text-[11px] text-slate-400">Database of Monsters, Spells, and Equipment with Instant Dispatch</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick={() => showImportModal = true}
            class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>📥</span> Import Data
          </button>
          <button
            onclick={() => isOpen = false}
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Action Toast Banner -->
      {#if actionToast}
        <div class="bg-emerald-950/90 border-b border-emerald-800/60 px-4 py-2 text-center text-xs font-bold text-emerald-300 animate-pulse shrink-0">
          ⚡ {actionToast}
        </div>
      {/if}

      <!-- Search & Category Filters -->
      <div class="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="flex-1 min-w-[16rem]">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search monsters, spells, magical items, abilities…"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
        </div>

        <!-- Filter Pills -->
        <div class="flex items-center gap-1.5">
          {#each [
            { id: 'all', label: 'All', icon: '✨' },
            { id: 'creature', label: 'Monsters', icon: '🐉' },
            { id: 'spell', label: 'Spells', icon: '🔮' },
            { id: 'item', label: 'Items', icon: '⚔️' },
          ] as pill}
            <button
              onclick={() => selectedCategory = pill.id as any}
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 {selectedCategory === pill.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'}"
            >
              <span>{pill.icon}</span>
              <span>{pill.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Main Split View (List + Detail) -->
      <div class="flex-1 min-h-0 flex overflow-hidden">

        <!-- Entity List -->
        <div class="w-1/2 border-r border-slate-800 overflow-y-auto p-3 space-y-2">
          {#if filteredEntities.length === 0}
            <div class="text-center py-16 text-slate-500 text-xs">
              No entries found matching "{searchQuery}".
            </div>
          {:else}
            {#each filteredEntities as entity (entity.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => selectedEntity = entity}
                onkeydown={(e) => { if (e.key === 'Enter') selectedEntity = entity; }}
                class="p-3 rounded-xl border transition-all cursor-pointer text-left {selectedEntity?.id === entity.id ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-600/10' : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'}"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-slate-200 truncate">{entity.name}</span>
                      {#if entity.type === 'creature'}
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-950/60 text-rose-300 border border-rose-800/40">CR {entity.cr ?? 0}</span>
                      {:else if entity.type === 'spell'}
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">Lvl {entity.level}</span>
                      {:else}
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950/60 text-amber-300 border border-amber-800/40">{entity.rarity || 'Item'}</span>
                      {/if}
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1 line-clamp-1">{entity.description}</p>
                  </div>

                  <!-- Instant Action Buttons -->
                  <div class="flex items-center gap-1 shrink-0">
                    {#if entity.type === 'creature'}
                      <button
                        onclick={(e) => { e.stopPropagation(); handleAddToCombat(entity); }}
                        class="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-[10px] font-bold rounded-lg border border-rose-800/40 transition-colors"
                        title="Add to Active Combat Encounter"
                      >
                        + Combat
                      </button>
                    {:else if entity.type === 'item'}
                      <button
                        onclick={(e) => { e.stopPropagation(); handleSendToStash(entity); }}
                        class="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-800/40 transition-colors"
                        title="Send to Party Stash"
                      >
                        + Stash
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <!-- Detail Preview Pane -->
        <div class="w-1/2 overflow-y-auto p-5 bg-slate-950/30">
          {#if !selectedEntity}
            <div class="text-center py-24 text-slate-500 text-xs">
              Select an entity from the list to view its complete 5e SRD stat block.
            </div>
          {:else}
            <div class="space-y-4">
              <!-- Detail Header -->
              <div class="border-b border-slate-800 pb-3 flex items-start justify-between">
                <div>
                  <h3 class="text-lg font-black text-slate-100">{selectedEntity.name}</h3>
                  <p class="text-xs text-slate-400 italic">
                    {#if selectedEntity.type === 'creature'}
                      {selectedEntity.size} {selectedEntity.creatureType}, {selectedEntity.alignment}
                    {:else if selectedEntity.type === 'spell'}
                      Level {selectedEntity.level} {selectedEntity.school}
                    {:else}
                      {selectedEntity.rarity} · {selectedEntity.category}
                    {/if}
                  </p>
                </div>

                <!-- Instant Action in Detail Header -->
                {#if selectedEntity.type === 'creature'}
                  <button
                    onclick={() => handleAddToCombat(selectedEntity!)}
                    class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors shadow"
                  >
                    ⚔️ Add to Active Combat
                  </button>
                {:else if selectedEntity.type === 'item'}
                  <button
                    onclick={() => handleSendToStash(selectedEntity!)}
                    class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-xl transition-colors shadow"
                  >
                    💰 Send to Party Stash
                  </button>
                {/if}
              </div>

              <!-- Creature Stat Block Details -->
              {#if selectedEntity.type === 'creature'}
                <div class="grid grid-cols-3 gap-2 text-center text-xs">
                  <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">
                    <span class="text-[9px] text-slate-500 uppercase font-bold block">Armor Class</span>
                    <span class="text-sm font-bold text-slate-200">{selectedEntity.ac}</span>
                  </div>
                  <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">
                    <span class="text-[9px] text-slate-500 uppercase font-bold block">Hit Points</span>
                    <span class="text-sm font-bold text-rose-300">{selectedEntity.hp}</span>
                  </div>
                  <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">
                    <span class="text-[9px] text-slate-500 uppercase font-bold block">Speed</span>
                    <span class="text-sm font-bold text-slate-200">{selectedEntity.speed}</span>
                  </div>
                </div>

                <!-- 6 Ability Scores -->
                <div class="grid grid-cols-6 gap-1 bg-slate-950 border border-slate-800 rounded-xl p-2 text-center">
                  {#each [
                    { label: 'STR', val: selectedEntity.str ?? 10 },
                    { label: 'DEX', val: selectedEntity.dex ?? 10 },
                    { label: 'CON', val: selectedEntity.con ?? 10 },
                    { label: 'INT', val: selectedEntity.int ?? 10 },
                    { label: 'WIS', val: selectedEntity.wis ?? 10 },
                    { label: 'CHA', val: selectedEntity.cha ?? 10 },
                  ] as score}
                    <div>
                      <span class="text-[8px] font-bold text-slate-500 block">{score.label}</span>
                      <span class="text-xs font-bold text-slate-200">{score.val}</span>
                      <span class="text-[9px] text-slate-400 block font-mono">
                        {Math.floor((score.val - 10) / 2) >= 0 ? `+${Math.floor((score.val - 10) / 2)}` : Math.floor((score.val - 10) / 2)}
                      </span>
                    </div>
                  {/each}
                </div>

                {#if selectedEntity.actions && selectedEntity.actions.length > 0}
                  <div class="space-y-2">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Actions</h4>
                    {#each selectedEntity.actions as action}
                      <div class="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 text-xs">
                        <span class="font-bold text-indigo-300">{action.name}:</span>
                        <span class="text-slate-300 ml-1">{action.desc}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}

              <!-- Spell Details -->
              {#if selectedEntity.type === 'spell'}
                <div class="grid grid-cols-2 gap-2 text-xs bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div><span class="text-slate-500">Casting Time:</span> <b class="text-slate-200">{selectedEntity.castingTime}</b></div>
                  <div><span class="text-slate-500">Range:</span> <b class="text-slate-200">{selectedEntity.range}</b></div>
                  <div><span class="text-slate-500">Components:</span> <b class="text-slate-200">{selectedEntity.components}</b></div>
                  <div><span class="text-slate-500">Duration:</span> <b class="text-slate-200">{selectedEntity.duration}</b></div>
                </div>
              {/if}

              <!-- Item Details -->
              {#if selectedEntity.type === 'item'}
                <div class="grid grid-cols-3 gap-2 text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <div><span class="text-[9px] text-slate-500 block">Cost</span> <b class="text-amber-300">{selectedEntity.cost}</b></div>
                  <div><span class="text-[9px] text-slate-500 block">Weight</span> <b class="text-slate-200">{selectedEntity.weight} lbs</b></div>
                  <div><span class="text-[9px] text-slate-500 block">Attunement</span> <b class="text-slate-200">{selectedEntity.requiresAttunement ? 'Yes' : 'No'}</b></div>
                </div>
              {/if}

              <!-- Description -->
              <div class="space-y-1">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Description</h4>
                <p class="text-xs text-slate-300 leading-relaxed bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 whitespace-pre-wrap">
                  {selectedEntity.description}
                </p>
              </div>

              {#if selectedEntity.source === 'imported'}
                <div class="pt-2 flex justify-end">
                  <button
                    onclick={() => handleDeleteEntity(selectedEntity!.id)}
                    class="px-3 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold rounded-lg border border-rose-800/40 transition-colors"
                  >
                    Delete Imported Entity
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

      </div>

    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════
     IMPORT SRD DATA MODAL
════════════════════════════════════════════════════════════════════════════ -->
{#if showImportModal}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showImportModal = false; }}
  >
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-bold text-slate-100">Batch Import 5e Compendium JSON</h3>
        <button onclick={() => showImportModal = false} class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <p class="text-xs text-slate-400">
        Upload standard 5e SRD, Open5e, or 5e-bits JSON files (single stat blocks or full datasets of monsters, spells, and equipment).
      </p>

      <label class="block w-full py-10 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-center cursor-pointer bg-slate-950/40 transition-all">
        <span class="text-3xl block mb-2">📂</span>
        <span class="text-xs font-bold text-slate-300 block">Click or Drop JSON Data File</span>
        <span class="text-[10px] text-slate-500 block mt-0.5">Supports .json datasets</span>
        <input
          type="file"
          accept=".json"
          class="hidden"
          onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }}
        />
      </label>

      {#if importFeedback}
        <div class="p-3 rounded-lg text-xs font-semibold {importFeedback.startsWith('Error') ? 'bg-rose-950/80 text-rose-300 border border-rose-800/40' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'}">
          {importFeedback}
        </div>
      {/if}

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          onclick={() => showImportModal = false}
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
