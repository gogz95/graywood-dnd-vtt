<!-- src/lib/components/compendium/CompendiumBrowser.svelte -->
<!-- 5e SRD 5.1 Indexed Compendium Browser & Search System (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';
  import { compendiumStore } from '../../stores/compendiumStore.svelte';
  import {
    compendiumDb,
    type CompendiumMonster,
    type CompendiumSpell,
    type CompendiumItem,
    type CompendiumRule,
  } from '../../db/compendiumDb';
  import StatblockDrawer, { type SelectedCompendiumEntry } from './StatblockDrawer.svelte';

  type CompendiumTab = 'spells' | 'monsters' | 'items' | 'rules';

  // ── State ──────────────────────────────────────────────────────────────────
  let activeTab = $state<CompendiumTab>('spells');
  let searchQuery = $state('');
  let debouncedQuery = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Spells Filters
  let spellLevel = $state<string>('all');
  let spellSchool = $state<string>('all');

  // Monsters Filters
  let monsterCrMin = $state<string>('all');
  let monsterCrMax = $state<string>('all');
  let monsterType = $state<string>('all');

  // Items Filters
  let itemRarity = $state<string>('all');
  let itemType = $state<string>('all');

  // Rules Filters
  let ruleCategory = $state<string>('all');

  // Query Results & Loading State
  let queryResults = $state<any[]>([]);
  let isQuerying = $state(false);

  // Drawer & Action State
  let isDrawerOpen = $state(false);
  let selectedEntry = $state<SelectedCompendiumEntry | null>(null);
  let actionToast = $state<string | null>(null);

  // ── Debounced Search Handler ───────────────────────────────────────────────
  function handleSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchQuery = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = val.trim().toLowerCase();
    }, 150);
  }

  function showToast(msg: string) {
    actionToast = msg;
    setTimeout(() => {
      if (actionToast === msg) actionToast = null;
    }, 2800);
  }

  // ── Static Reference Constants ─────────────────────────────────────────────
  const BASE_SPELL_SCHOOLS = [
    'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
    'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
  ];

  const BASE_CREATURE_TYPES = [
    'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
    'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
    'Monstrosity', 'Ooze', 'Plant', 'Undead'
  ];

  const BASE_ITEM_RARITIES = [
    'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'
  ];

  const BASE_ITEM_TYPES = [
    'Weapon', 'Armor', 'Shield', 'Potion', 'Ring', 'Rod',
    'Scroll', 'Staff', 'Wand', 'Wondrous Item', 'Equipment'
  ];

  const BASE_RULE_CATEGORIES = [
    'Combat', 'Spellcasting', 'Core Rules', 'Rules Reference'
  ];

  // ── Category-Specific Filters Derived using Svelte 5 $derived ──────────────
  let derivedSpellSchools = $derived.by<string[]>(() => {
    const schools = new Set<string>(BASE_SPELL_SCHOOLS);
    for (const s of compendiumStore.spells) {
      if (s.school) schools.add(s.school);
    }
    return Array.from(schools).sort();
  });

  let derivedCreatureTypes = $derived.by<string[]>(() => {
    const types = new Set<string>(BASE_CREATURE_TYPES);
    for (const m of compendiumStore.monsters) {
      if (m.type) {
        const base = m.type.split('(')[0].trim();
        types.add(base);
      }
    }
    return Array.from(types).sort();
  });

  let derivedItemRarities = $derived.by<string[]>(() => {
    const rarities = new Set<string>(BASE_ITEM_RARITIES);
    for (const it of compendiumStore.items) {
      if (it.rarity) rarities.add(it.rarity);
    }
    return Array.from(rarities);
  });

  let derivedItemTypes = $derived.by<string[]>(() => {
    const types = new Set<string>(BASE_ITEM_TYPES);
    for (const it of compendiumStore.items) {
      if (it.type) types.add(it.type);
    }
    return Array.from(types).sort();
  });

  let derivedRuleCategories = $derived.by<string[]>(() => {
    const cats = new Set<string>(BASE_RULE_CATEGORIES);
    for (const r of compendiumStore.rules) {
      if (r.category) cats.add(r.category);
    }
    return Array.from(cats).sort();
  });

  // ── Reactive Category Counts ───────────────────────────────────────────────
  let totalSpells = $derived(compendiumStore.spells.length);
  let totalMonsters = $derived(compendiumStore.monsters.length);
  let totalItems = $derived(compendiumStore.items.length);
  let totalRules = $derived(compendiumStore.rules.length);

  // ── Dexie Database Query Implementations (.where() & indexed ranges) ───────
  async function querySpells(school: string, levelStr: string, query: string): Promise<CompendiumSpell[]> {
    const hasSchool = school !== 'all';
    const hasLevel = levelStr !== 'all';
    const lvl = hasLevel ? parseInt(levelStr, 10) : -1;

    let results: CompendiumSpell[];

    if (hasSchool && hasLevel) {
      // Compound indexed query: [school+level]
      results = await compendiumDb.spells
        .where('[school+level]')
        .equals([school, lvl])
        .toArray();
    } else if (hasSchool) {
      // Single index query on school
      results = await compendiumDb.spells
        .where('school')
        .equalsIgnoreCase(school)
        .toArray();
    } else if (hasLevel) {
      // Single index query on level
      results = await compendiumDb.spells
        .where('level')
        .equals(lvl)
        .toArray();
    } else {
      results = await compendiumDb.spells.toArray();
    }

    // Substring fallback on name, description, and classes
    if (query) {
      results = results.filter((s) => {
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesDesc = s.description?.toLowerCase().includes(query);
        const matchesSchool = s.school.toLowerCase().includes(query);
        const matchesClasses = s.parentClass?.some((c) => c.toLowerCase().includes(query));
        return matchesName || matchesDesc || matchesSchool || matchesClasses;
      });
    }

    return results.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  async function queryMonsters(minCrStr: string, maxCrStr: string, typeStr: string, query: string): Promise<CompendiumMonster[]> {
    const hasMin = minCrStr !== 'all';
    const hasMax = maxCrStr !== 'all';
    const minCr = hasMin ? parseFloat(minCrStr) : 0;
    const maxCr = hasMax ? parseFloat(maxCrStr) : 30;
    const hasType = typeStr !== 'all';

    let results: CompendiumMonster[];

    if (hasMin || hasMax) {
      // Indexed range query on cr
      results = await compendiumDb.monsters
        .where('cr')
        .between(minCr, maxCr, true, true)
        .toArray();
      if (hasType) {
        results = results.filter((m) => m.type.toLowerCase().includes(typeStr.toLowerCase()));
      }
    } else if (hasType) {
      // Single index query on type
      results = await compendiumDb.monsters
        .where('type')
        .equalsIgnoreCase(typeStr)
        .toArray();
      if (results.length === 0) {
        const all = await compendiumDb.monsters.toArray();
        results = all.filter((m) => m.type.toLowerCase().includes(typeStr.toLowerCase()));
      }
    } else {
      results = await compendiumDb.monsters.toArray();
    }

    // Substring fallback on name, type, alignment, and actions
    if (query) {
      results = results.filter((m) => {
        const matchesName = m.name.toLowerCase().includes(query);
        const matchesType = m.type.toLowerCase().includes(query);
        const matchesAlign = (m.alignment || '').toLowerCase().includes(query);
        const matchesActions = m.actions?.some(
          (a) => a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query)
        );
        return matchesName || matchesType || matchesAlign || matchesActions;
      });
    }

    return results.sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
  }

  async function queryItems(rarityStr: string, typeStr: string, query: string): Promise<CompendiumItem[]> {
    const hasRarity = rarityStr !== 'all';
    const hasType = typeStr !== 'all';

    let results: CompendiumItem[];

    if (hasType && hasRarity) {
      // Compound index query: [type+rarity]
      results = await compendiumDb.items
        .where('[type+rarity]')
        .equals([typeStr, rarityStr])
        .toArray();
      if (results.length === 0) {
        const all = await compendiumDb.items.toArray();
        results = all.filter(
          (it) =>
            it.type.toLowerCase().includes(typeStr.toLowerCase()) &&
            it.rarity.toLowerCase() === rarityStr.toLowerCase()
        );
      }
    } else if (hasRarity) {
      results = await compendiumDb.items
        .where('rarity')
        .equalsIgnoreCase(rarityStr)
        .toArray();
    } else if (hasType) {
      results = await compendiumDb.items
        .where('type')
        .equalsIgnoreCase(typeStr)
        .toArray();
      if (results.length === 0) {
        const all = await compendiumDb.items.toArray();
        results = all.filter((it) => it.type.toLowerCase().includes(typeStr.toLowerCase()));
      }
    } else {
      results = await compendiumDb.items.toArray();
    }

    // Substring fallback on name, type, rarity, and description
    if (query) {
      results = results.filter((it) => {
        const matchesName = it.name.toLowerCase().includes(query);
        const matchesType = it.type.toLowerCase().includes(query);
        const matchesRarity = (it.rarity || '').toLowerCase().includes(query);
        const matchesDesc = (it.description || '').toLowerCase().includes(query);
        return matchesName || matchesType || matchesRarity || matchesDesc;
      });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function queryRules(catStr: string, query: string): Promise<CompendiumRule[]> {
    const hasCat = catStr !== 'all';
    let results: CompendiumRule[];

    if (hasCat) {
      results = await compendiumDb.rules
        .where('category')
        .equalsIgnoreCase(catStr)
        .toArray();
    } else {
      results = await compendiumDb.rules.toArray();
    }

    // Substring fallback on title, category, and content
    if (query) {
      results = results.filter((r) => {
        const matchesTitle = r.title.toLowerCase().includes(query);
        const matchesCat = r.category.toLowerCase().includes(query);
        const matchesSlug = r.slug.toLowerCase().includes(query);
        const matchesContent = r.content.toLowerCase().includes(query);
        return matchesTitle || matchesCat || matchesSlug || matchesContent;
      });
    }

    return results.sort((a, b) => a.title.localeCompare(b.title));
  }

  // ── Reactive Query Runner ──────────────────────────────────────────────────
  $effect(() => {
    const tab = activeTab;
    const q = debouncedQuery;
    const sSch = spellSchool;
    const sLvl = spellLevel;
    const mMin = monsterCrMin;
    const mMax = monsterCrMax;
    const mTyp = monsterType;
    const iRar = itemRarity;
    const iTyp = itemType;
    const rCat = ruleCategory;

    // React to store changes as well
    const _counts = totalSpells + totalMonsters + totalItems + totalRules;

    let cancelled = false;
    isQuerying = true;

    async function execute() {
      try {
        let items: any[] = [];
        if (tab === 'spells') {
          items = await querySpells(sSch, sLvl, q);
        } else if (tab === 'monsters') {
          items = await queryMonsters(mMin, mMax, mTyp, q);
        } else if (tab === 'items') {
          items = await queryItems(iRar, iTyp, q);
        } else if (tab === 'rules') {
          items = await queryRules(rCat, q);
        }

        if (!cancelled) {
          queryResults = items;
          isQuerying = false;
        }
      } catch (err) {
        console.error('Compendium query failure:', err);
        if (!cancelled) isQuerying = false;
      }
    }

    execute();

    return () => {
      cancelled = true;
    };
  });

  // Type-casted lists for rendering
  let filteredSpells = $derived(activeTab === 'spells' ? (queryResults as CompendiumSpell[]) : []);
  let filteredMonsters = $derived(activeTab === 'monsters' ? (queryResults as CompendiumMonster[]) : []);
  let filteredItems = $derived(activeTab === 'items' ? (queryResults as CompendiumItem[]) : []);
  let filteredRules = $derived(activeTab === 'rules' ? (queryResults as CompendiumRule[]) : []);
  let currentResultCount = $derived(queryResults.length);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleSelectEntry(entry: SelectedCompendiumEntry) {
    selectedEntry = entry;
    isDrawerOpen = true;
  }

  function handleAddToCombat(monster: CompendiumMonster) {
    sessionStore.addMonsterToCombat({
      name: monster.name,
      hp: monster.hp,
      ac: monster.ac,
      cr: monster.cr,
      description: `${monster.size} ${monster.type}, ${monster.alignment}. Speed: ${monster.speed || '30 ft.'}`,
    });
    audioEngine.triggerSfx('sfx-combat');
    showToast(`Added ${monster.name} to Encounter!`);
  }

  function handleSendToStash(item: CompendiumItem) {
    sessionStore.addItemToPartyStash({
      name: item.name,
      category: item.type || 'Equipment',
      quantity: 1,
      weight: item.weight || 1.0,
      description: item.description || '',
    });
    audioEngine.triggerSfx('sfx-bell');
    showToast(`Sent ${item.name} to Party Stash!`);
  }

  function handlePinQuickbar(item: SelectedCompendiumEntry) {
    const title = item.type === 'rule' ? item.data.title : item.data.name;
    showToast(`Pinned "${title}" to DM Quickbar!`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function crLabel(cr: number): string {
    if (cr === 0.125) return '⅛';
    if (cr === 0.25) return '¼';
    if (cr === 0.5) return '½';
    return String(cr);
  }

  function rarityBadgeColor(r?: string): string {
    const l = (r || '').toLowerCase();
    if (l.includes('uncommon')) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
    if (l.includes('very rare')) return 'text-purple-400 bg-purple-950/60 border-purple-800/60';
    if (l.includes('rare')) return 'text-blue-400 bg-blue-950/60 border-blue-800/60';
    if (l.includes('legendary') || l.includes('artifact')) return 'text-amber-400 bg-amber-950/60 border-amber-800/60';
    return 'text-slate-400 bg-slate-900 border-slate-700';
  }
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950 text-slate-100 font-sans select-none">

  <!-- ═════════════════════════════════════════════════════════════════════════
       1. TOP SEARCH & CATEGORY BAR
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="px-5 py-3 border-b border-slate-800 bg-slate-900/90 shrink-0 space-y-3">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🏛️</span>
        <div>
          <h2 class="text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
            5e SRD 5.1 Compendium
            <span class="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              Live Database
            </span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Indexed searchable reference catalog for core 5e rules, monsters, spells & gear
          </p>
        </div>
      </div>

      <!-- Action Toast Indicator -->
      {#if actionToast}
        <div class="px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold animate-pulse">
          ⚡ {actionToast}
        </div>
      {/if}
    </div>

    <!-- Category Tabs: Spells, Monsters, Items, Rules -->
    <div class="flex items-center gap-1.5 border-b border-slate-800 pb-2">
      <button
        type="button"
        onclick={() => (activeTab = 'spells')}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 {activeTab === 'spells'
          ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 shadow-md shadow-cyan-950/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}"
      >
        <span>✨</span>
        <span>Spells</span>
        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-950 text-slate-400">
          {totalSpells}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeTab = 'monsters')}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 {activeTab === 'monsters'
          ? 'bg-rose-950/70 text-rose-300 border border-rose-800/60 shadow-md shadow-rose-950/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}"
      >
        <span>🐉</span>
        <span>Monsters</span>
        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-950 text-slate-400">
          {totalMonsters}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeTab = 'items')}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 {activeTab === 'items'
          ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60 shadow-md shadow-amber-950/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}"
      >
        <span>⚔️</span>
        <span>Items</span>
        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-950 text-slate-400">
          {totalItems}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeTab = 'rules')}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 {activeTab === 'rules'
          ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 shadow-md shadow-indigo-950/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}"
      >
        <span>📜</span>
        <span>Rules</span>
        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-950 text-slate-400">
          {totalRules}
        </span>
      </button>
    </div>

    <!-- Search Input + Dynamic Filter Ribbon -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search Box -->
      <div class="relative flex-1 min-w-[240px]">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
        <input
          type="search"
          value={searchQuery}
          oninput={handleSearchInput}
          placeholder="Search by name, action, school, damage, or keyword..."
          class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Category-Specific Filters Derived using Svelte 5 -->
      {#if activeTab === 'spells'}
        <!-- Spell Level Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="spell-lvl-select" class="text-slate-400 font-semibold text-[11px]">Level:</label>
          <select
            id="spell-lvl-select"
            bind:value={spellLevel}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Levels</option>
            <option value="0">Cantrip (0)</option>
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as lvl}
              <option value={String(lvl)}>Level {lvl}</option>
            {/each}
          </select>
        </div>

        <!-- Spell School Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="spell-school-select" class="text-slate-400 font-semibold text-[11px]">School:</label>
          <select
            id="spell-school-select"
            bind:value={spellSchool}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Schools</option>
            {#each derivedSpellSchools as sch}
              <option value={sch}>{sch}</option>
            {/each}
          </select>
        </div>

      {:else if activeTab === 'monsters'}
        <!-- CR Min -->
        <div class="flex items-center gap-1 text-xs">
          <label for="monster-cr-min" class="text-slate-400 font-semibold text-[11px]">CR Min:</label>
          <select
            id="monster-cr-min"
            bind:value={monsterCrMin}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
          >
            <option value="all">Any</option>
            <option value="0">0</option>
            <option value="0.125">1/8</option>
            <option value="0.25">1/4</option>
            <option value="0.5">1/2</option>
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20] as cr}
              <option value={String(cr)}>{cr}</option>
            {/each}
          </select>
        </div>

        <!-- CR Max -->
        <div class="flex items-center gap-1 text-xs">
          <label for="monster-cr-max" class="text-slate-400 font-semibold text-[11px]">CR Max:</label>
          <select
            id="monster-cr-max"
            bind:value={monsterCrMax}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
          >
            <option value="all">Any</option>
            <option value="0.25">1/4</option>
            <option value="0.5">1/2</option>
            {#each [1, 2, 3, 4, 5, 8, 10, 15, 20, 30] as cr}
              <option value={String(cr)}>{cr}</option>
            {/each}
          </select>
        </div>

        <!-- Creature Type Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="monster-type-select" class="text-slate-400 font-semibold text-[11px]">Type:</label>
          <select
            id="monster-type-select"
            bind:value={monsterType}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
          >
            <option value="all">All Types</option>
            {#each derivedCreatureTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

      {:else if activeTab === 'items'}
        <!-- Item Rarity Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="item-rarity-select" class="text-slate-400 font-semibold text-[11px]">Rarity:</label>
          <select
            id="item-rarity-select"
            bind:value={itemRarity}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Rarities</option>
            {#each derivedItemRarities as rar}
              <option value={rar}>{rar}</option>
            {/each}
          </select>
        </div>

        <!-- Item Type Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="item-type-select" class="text-slate-400 font-semibold text-[11px]">Type:</label>
          <select
            id="item-type-select"
            bind:value={itemType}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Types</option>
            {#each derivedItemTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

      {:else if activeTab === 'rules'}
        <!-- Rule Category Filter -->
        <div class="flex items-center gap-1 text-xs">
          <label for="rule-cat-select" class="text-slate-400 font-semibold text-[11px]">Category:</label>
          <select
            id="rule-cat-select"
            bind:value={ruleCategory}
            class="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Categories</option>
            {#each derivedRuleCategories as cat}
              <option value={cat}>{cat}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- Results Count Subheader -->
  <div class="px-5 py-2 border-b border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
    <span>
      Showing {currentResultCount} {activeTab}
      {#if debouncedQuery} matching <strong class="text-slate-200">"{searchQuery}"</strong>{/if}
    </span>
    {#if isQuerying}
      <span class="text-[10px] text-indigo-400 font-mono animate-pulse">Indexed Querying...</span>
    {/if}
  </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       2. SCROLLABLE RESULTS LIST VIEW
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
    <!-- Empty State Fallback -->
    {#if currentResultCount === 0 && !isQuerying}
      <div class="py-20 flex flex-col items-center justify-center text-center space-y-2 text-slate-500">
        <span class="text-4xl opacity-50">📭</span>
        <h3 class="text-sm font-bold text-slate-400">No records found</h3>
        <p class="text-xs text-slate-600 max-w-sm">
          No {activeTab} match your current filter criteria or search query.
          Try clearing your search filters or indexing custom packages.
        </p>
      </div>

    <!-- Spells List View -->
    {:else if activeTab === 'spells'}
      {#each filteredSpells as spell (spell.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => handleSelectEntry({ type: 'spell', data: spell })}
          onkeydown={(e) => e.key === 'Enter' && handleSelectEntry({ type: 'spell', data: spell })}
          class="p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-900/80 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer group"
        >
          <div class="min-w-0 flex-1 flex items-start gap-3">
            <span class="text-lg mt-0.5 shrink-0">✨</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  {spell.name}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-900/60">
                  {spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                </span>
                <span class="text-[10px] text-slate-400">
                  {spell.school}
                </span>
                {#if spell.ritual}
                  <span class="text-[9px] font-mono uppercase px-1 rounded bg-slate-800 text-slate-300">Ritual</span>
                {/if}
                {#if spell.concentration || spell.duration?.toLowerCase().includes('concentration')}
                  <span class="text-[9px] font-mono uppercase px-1 rounded bg-amber-950 text-amber-300 border border-amber-800/40">Concentration</span>
                {/if}
              </div>

              <div class="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-mono">
                <span>Cast: {spell.castingTime || spell.casting_time}</span>
                <span>Range: {spell.range}</span>
                <span>Dur: {spell.duration}</span>
              </div>
            </div>
          </div>
        </div>
      {/each}

    <!-- Monsters List View -->
    {:else if activeTab === 'monsters'}
      {#each filteredMonsters as monster (monster.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => handleSelectEntry({ type: 'monster', data: monster })}
          onkeydown={(e) => e.key === 'Enter' && handleSelectEntry({ type: 'monster', data: monster })}
          class="p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-rose-900/80 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer group"
        >
          <div class="min-w-0 flex-1 flex items-start gap-3">
            <span class="text-lg mt-0.5 shrink-0">🐉</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-100 group-hover:text-rose-400 transition-colors">
                  {monster.name}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-900/60">
                  CR {crLabel(monster.cr)}
                </span>
                <span class="text-[10px] text-slate-400">
                  {monster.size || 'Medium'} {monster.type}
                </span>
                {#if monster.alignment}
                  <span class="text-[10px] text-slate-500 italic">· {monster.alignment}</span>
                {/if}
              </div>

              <!-- Quick Stats -->
              <div class="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-mono">
                <span>AC: <strong class="text-slate-200">{monster.ac}</strong></span>
                <span>HP: <strong class="text-rose-400">{monster.hp}</strong></span>
                {#if monster.speed}<span>Spd: {monster.speed}</span>{/if}
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-1.5 shrink-0" onclick={(e) => e.stopPropagation()} role="presentation">
            <button
              type="button"
              onclick={() => handleAddToCombat(monster)}
              class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition-colors shadow"
              title="Add to Encounter Combat Tracker"
            >
              + Encounter
            </button>
          </div>
        </div>
      {/each}

    <!-- Items List View -->
    {:else if activeTab === 'items'}
      {#each filteredItems as item (item.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => handleSelectEntry({ type: 'item', data: item })}
          onkeydown={(e) => e.key === 'Enter' && handleSelectEntry({ type: 'item', data: item })}
          class="p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-900/80 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer group"
        >
          <div class="min-w-0 flex-1 flex items-start gap-3">
            <span class="text-lg mt-0.5 shrink-0">⚔️</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                  {item.name}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border {rarityBadgeColor(item.rarity)}">
                  {item.rarity || 'Common'}
                </span>
                <span class="text-[10px] text-slate-400">{item.type}</span>
                {#if item.cost}<span class="text-[10px] font-mono text-amber-400/90 font-semibold">{item.cost}</span>{/if}
                {#if item.weight !== undefined}<span class="text-[10px] font-mono text-slate-500">{item.weight} lb.</span>{/if}
              </div>

              {#if item.description}
                <p class="text-[11px] text-slate-500 mt-1 line-clamp-1">
                  {item.description}
                </p>
              {/if}
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0" onclick={(e) => e.stopPropagation()} role="presentation">
            <button
              type="button"
              onclick={() => handleSendToStash(item)}
              class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 transition-colors shadow"
              title="Add to Party Stash"
            >
              + Stash
            </button>
          </div>
        </div>
      {/each}

    <!-- Rules List View -->
    {:else if activeTab === 'rules'}
      {#each filteredRules as rule (rule.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => handleSelectEntry({ type: 'rule', data: rule })}
          onkeydown={(e) => e.key === 'Enter' && handleSelectEntry({ type: 'rule', data: rule })}
          class="p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-900/80 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer group"
        >
          <div class="min-w-0 flex-1 flex items-start gap-3">
            <span class="text-lg mt-0.5 shrink-0">📜</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                  {rule.title}
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                  {rule.category}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                {rule.content}
              </p>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- ═════════════════════════════════════════════════════════════════════════
     3. SLIDING STATBLOCK / DETAIL DRAWER OVERLAY
══════════════════════════════════════════════════════════════════════════ -->
<StatblockDrawer
  bind:isOpen={isDrawerOpen}
  entry={selectedEntry}
  onClose={() => (isDrawerOpen = false)}
  onAddToEncounter={handleAddToCombat}
  onPinToQuickbar={handlePinQuickbar}
/>
