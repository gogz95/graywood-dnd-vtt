<script lang="ts">
  // LoreWikiView.svelte — Master-detail Relational Lore Graph Wiki & Valuation Engine
  // Integrates entity-relationship navigation, @mention autocomplete, token battle mat spawning,
  // procedural trade manifests, and Sane Magical Prices utility curve calculation.

  import { onMount } from 'svelte';
  import {
    loreGraphStore,
    type EntityType,
    type RelationType,
    type LoreEntity,
    type LinkedEntityRecord,
  } from '../../stores/loreGraphStore.svelte';
  import {
    calculateSanePrice,
    generateManifest,
    addCargoToPartyStash,
    type ItemRarity,
    type ManifestCategory,
    type ManifestValueTier,
    type TradeManifest,
    type UtilityFeature,
  } from '../../economy/valuationEngine';
  import { spawnCombatantToken } from '../../ipc/tauriBridge';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import { audioEngine } from '../../audio/AudioEngine';
  import { sendWsEvent } from '../../../stores/websocketStore';

  // ── Sub-view Tabs ──────────────────────────────────────────────────────────
  type LoreSubView = 'wiki' | 'manifests' | 'pricing';
  let activeSubView = $state<LoreSubView>('wiki');

  // ── Entity Filtering & Search ──────────────────────────────────────────────
  let typeFilter = $state<EntityType | 'ALL'>('ALL');
  let searchQuery = $state('');
  let selectedTag = $state<string | null>(null);

  const filteredEntities = $derived(
    loreGraphStore.searchEntities(searchQuery, typeFilter, selectedTag)
  );

  const activeEntity = $derived(
    loreGraphStore.entities.find(e => e.id === loreGraphStore.activeEntityId) || loreGraphStore.entities[0] || null
  );

  const linkedRecords = $derived<LinkedEntityRecord[]>(
    activeEntity ? loreGraphStore.getLinkedEntities(activeEntity.id) : []
  );

  const allTags = $derived(loreGraphStore.getAllTags());

  // ── Entity Edit Mode & @mention Autocomplete ───────────────────────────────
  let isEditing = $state(false);
  let editName = $state('');
  let editSummary = $state('');
  let editBody = $state('');
  let editTags = $state('');
  let textareaEl: HTMLTextAreaElement | null = $state(null);

  // @mention state
  let mentionQuery = $state<string | null>(null);
  let mentionPos = $state<{ top: number; left: number } | null>(null);
  let mentionCursorIndex = $state<number>(0);
  const mentionSuggestions = $derived(
    mentionQuery !== null ? loreGraphStore.getMentionSuggestions(mentionQuery) : []
  );

  $effect(() => {
    if (activeEntity && !isEditing) {
      editName = activeEntity.name;
      editSummary = activeEntity.summary;
      editBody = activeEntity.bodyMarkdown;
      editTags = activeEntity.tags.join(', ');
    }
  });

  function startEditing() {
    if (!activeEntity) return;
    editName = activeEntity.name;
    editSummary = activeEntity.summary;
    editBody = activeEntity.bodyMarkdown;
    editTags = activeEntity.tags.join(', ');
    isEditing = true;
  }

  function saveEditing() {
    if (!activeEntity) return;
    const parsedTags = editTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    loreGraphStore.updateEntity(activeEntity.id, {
      name: editName.trim() || activeEntity.name,
      summary: editSummary.trim(),
      bodyMarkdown: editBody,
      tags: parsedTags,
    });
    isEditing = false;
    mentionQuery = null;
  }

  function handleBodyInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const val = target.value;
    const cursorPos = target.selectionStart;
    mentionCursorIndex = cursorPos;

    // Check for @mention trigger
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/@([\w\s-]{0,25})$/);

    if (match) {
      mentionQuery = match[1];
      mentionPos = { top: 38, left: 16 };
    } else {
      mentionQuery = null;
    }
  }

  function insertMention(entity: LoreEntity) {
    if (!textareaEl) return;
    const val = editBody;
    const textBefore = val.slice(0, mentionCursorIndex);
    const textAfter = val.slice(mentionCursorIndex);
    const atIndex = textBefore.lastIndexOf('@');

    if (atIndex !== -1) {
      const newTextBefore = textBefore.slice(0, atIndex) + `@${entity.name} `;
      editBody = newTextBefore + textAfter;
      mentionQuery = null;
      // Also automatically link relationship if none exists
      if (activeEntity && activeEntity.id !== entity.id) {
        const existing = loreGraphStore.relationships.find(
          r => (r.sourceId === activeEntity.id && r.targetId === entity.id) ||
               (r.sourceId === entity.id && r.targetId === activeEntity.id)
        );
        if (!existing) {
          loreGraphStore.addRelationship({
            sourceId: activeEntity.id,
            targetId: entity.id,
            relationType: 'ALLIED_WITH',
            notes: `Mentioned in ${activeEntity.name} notes`,
          });
        }
      }
    }
  }

  // ── New Entity Modal ───────────────────────────────────────────────────────
  let showNewEntityModal = $state(false);
  let newType = $state<EntityType>('NPC');
  let newName = $state('');
  let newSummary = $state('');
  let newTags = $state('');
  let newCr = $state<number>(3);
  let newAlignment = $state('Neutral');

  function handleCreateEntity() {
    if (!newName.trim()) return;
    const parsedTags = newTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    const attributes: Record<string, string | number | boolean> = {};
    if (newType === 'NPC') {
      attributes.cr = newCr;
      attributes.alignment = newAlignment;
    }

    const created = loreGraphStore.addEntity({
      type: newType,
      name: newName.trim(),
      summary: newSummary.trim() || `${newType} record in campaign registry.`,
      bodyMarkdown: `### Description\nComprehensive notes regarding ${newName.trim()}.\n\n### Relationships\nConnected within regional campaign theater.`,
      tags: parsedTags.length > 0 ? parsedTags : [newType.toLowerCase()],
      attributes,
    });

    showNewEntityModal = false;
    newName = '';
    newSummary = '';
    newTags = '';
    loreGraphStore.activeEntityId = created.id;
  }

  // ── New Relationship Modal ─────────────────────────────────────────────────
  let showRelModal = $state(false);
  let relTargetId = $state('');
  let relType = $state<RelationType>('ALLIED_WITH');
  let relNotes = $state('');

  function handleAddRelationship() {
    if (!activeEntity || !relTargetId) return;
    loreGraphStore.addRelationship({
      sourceId: activeEntity.id,
      targetId: relTargetId,
      relationType: relType,
      notes: relNotes.trim() || undefined,
    });
    showRelModal = false;
    relNotes = '';
  }

  // ── Spawn Token to Battle Mat ──────────────────────────────────────────────
  let spawnSuccessNotice = $state<string | null>(null);

  async function handleSpawnToken() {
    if (!activeEntity) return;

    const hp = typeof activeEntity.attributes.hp === 'number'
      ? activeEntity.attributes.hp
      : typeof activeEntity.attributes.cr === 'number'
      ? Math.max(10, Math.round(activeEntity.attributes.cr * 14))
      : 25;

    const isPlayer = activeEntity.tags.includes('player') || activeEntity.tags.includes('hero');

    // 1. Dispatch custom event for Canvas battle mat listeners
    window.dispatchEvent(
      new CustomEvent('vtt:spawn-token', {
        detail: {
          name: activeEntity.name,
          hp,
          maxHp: hp,
          isPlayer,
          color: isPlayer ? '#22c55e' : activeEntity.type === 'NPC' ? '#ef4444' : '#6366f1',
          gx: Math.floor(Math.random() * 8) + 2,
          gy: Math.floor(Math.random() * 6) + 2,
        },
      })
    );

    // 2. Also register combatant via IPC bridge if running Tauri/REST
    try {
      await spawnCombatantToken({
        encounter_id: 'active',
        monster_compendium_id: activeEntity.id,
        custom_name: activeEntity.name,
        initiative: Math.floor(Math.random() * 20) + 1,
        canvas_x: 100,
        canvas_y: 100,
      });
    } catch {
      // Offline / standalone browser canvas mode
    }

    dispatchSoundEvent('turn_bell');
    spawnSuccessNotice = `Spawned "${activeEntity.name}" [HP ${hp}] onto the Battle Mat!`;
    setTimeout(() => { spawnSuccessNotice = null; }, 3500);
  }

  // ── Secret Lore Dispatch to Player ─────────────────────────────────────────
  let showWhisperMenu = $state(false);
  let whisperNotice = $state<string | null>(null);

  function getConnectedPartyList(): Array<{ name: string; pin: string; class: string }> {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('vtt_party_roster');
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((p: any) => ({ name: p.name, pin: p.pin, class: p.class })) : [];
      }
    } catch {
      // fallback
    }
    return [
      { name: 'Valen Shadowstep', pin: '1234', class: 'Rogue' },
      { name: 'Sister Nicole', pin: '5678', class: 'Cleric' },
      { name: 'Kaelen Flamebearer', pin: '4321', class: 'Wizard' },
    ];
  }

  function handleWhisperLore(playerPin?: string, playerName?: string) {
    if (!activeEntity) return;

    const whisperPayload = {
      id: `lore-whisper-${Date.now()}`,
      sender: 'DM Lore Archive',
      target_pin: playerPin,
      message: `📜 **${activeEntity.name} (${activeEntity.type})**\n\n${activeEntity.summary}\n\n${activeEntity.bodyMarkdown.slice(0, 350)}${activeEntity.bodyMarkdown.length > 350 ? '...' : ''}`,
      timestamp: Date.now(),
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:dm-whisper', { detail: whisperPayload }));
    }

    sendWsEvent({
      type: 'DM_WHISPER',
      payload: whisperPayload,
    });

    audioEngine.triggerSfx('sfx-secret');
    whisperNotice = `Whispered lore entry to ${playerName || 'All Connected Players'}!`;
    showWhisperMenu = false;
    setTimeout(() => { whisperNotice = null; }, 3500);
  }

  // ── Trade Manifest Generator State ─────────────────────────────────────────
  let manifestCategory = $state<ManifestCategory>('CARAVAN');
  let manifestTier = $state<ManifestValueTier>('WEALTHY');
  let currentManifest = $state<TradeManifest | null>(null);
  let stashNotice = $state<string | null>(null);

  function handleGenerateManifest() {
    currentManifest = generateManifest(manifestCategory, manifestTier);
  }

  function handleAddCargoToStash() {
    if (!currentManifest) return;
    const result = addCargoToPartyStash(currentManifest);
    stashNotice = `Transferred ${result.addedCount} cargo crates (${result.totalWeightLbs} lbs · ${result.totalValueGp.toLocaleString()} GP) into the Party Stash!`;
    setTimeout(() => { stashNotice = null; }, 4000);
  }

  // ── Sane Magical Prices Calculator State ───────────────────────────────────
  let calcRarity = $state<ItemRarity>('RARE');
  let calcSpellLvl = $state<number>(3);
  let calcConsumable = $state<boolean>(false);
  let calcAttunement = $state<boolean>(true);
  let calcCombatScalar = $state<number>(1);
  let calcUtilityFeatures = $state<UtilityFeature[]>(['FLIGHT']);

  const calculatedValuation = $derived(
    calculateSanePrice({
      rarity: calcRarity,
      spellLevelEquivalent: calcSpellLvl,
      isConsumable: calcConsumable,
      requiresAttunement: calcAttunement,
      combatBonusScalar: calcCombatScalar,
      utilityFeatures: calcUtilityFeatures,
    })
  );

  function toggleUtilityFeature(feature: UtilityFeature) {
    if (calcUtilityFeatures.includes(feature)) {
      calcUtilityFeatures = calcUtilityFeatures.filter(f => f !== feature);
    } else {
      calcUtilityFeatures = [...calcUtilityFeatures, feature];
    }
  }

  onMount(() => {
    handleGenerateManifest();
  });

  const TYPE_ICONS: Record<EntityType, string> = {
    NPC: '👤',
    FACTION: '🛡️',
    LOCATION: '🏰',
    QUEST: '📜',
    DOCUMENT: '📑',
  };

  const RELATION_COLORS: Record<RelationType, string> = {
    ALLIED_WITH: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
    ENEMY_OF: 'bg-rose-950/60 text-rose-300 border-rose-700/50',
    LOCATED_IN: 'bg-sky-950/60 text-sky-300 border-sky-700/50',
    MEMBER_OF: 'bg-indigo-950/60 text-indigo-300 border-indigo-700/50',
    CONTROLS: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
  };
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
  <!-- ── Top Header & Sub-view Switcher ────────────────────────────────────── -->
  <header class="h-11 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 gap-3">
    <div class="flex items-center gap-2">
      <span class="text-base">📜</span>
      <h1 class="text-xs font-bold uppercase tracking-wider text-slate-200">Relational Lore Graph &amp; Trade Valuation</h1>
    </div>

    <!-- Sub-view navigation tabs -->
    <div class="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
      <button
        onclick={() => activeSubView = 'wiki'}
        class="px-3 py-1 rounded-md font-medium transition-all {activeSubView === 'wiki' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
      >
        📖 Lore Graph Wiki
      </button>
      <button
        onclick={() => activeSubView = 'manifests'}
        class="px-3 py-1 rounded-md font-medium transition-all {activeSubView === 'manifests' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
      >
        📦 Trade Manifests
      </button>
      <button
        onclick={() => activeSubView = 'pricing'}
        class="px-3 py-1 rounded-md font-medium transition-all {activeSubView === 'pricing' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
      >
        🪙 Sane Magical Prices
      </button>
    </div>

    <!-- Quick action: New Entity -->
    <div>
      <button
        onclick={() => showNewEntityModal = true}
        class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow"
      >
        <span>+</span>
        <span>New Record</span>
      </button>
    </div>
  </header>

  <!-- ── Notice Toasts ─────────────────────────────────────────────────────── -->
  {#if spawnSuccessNotice}
    <div class="px-4 py-1.5 bg-emerald-900/80 border-b border-emerald-600 text-emerald-200 text-xs flex items-center justify-between shrink-0">
      <span>⚔️ {spawnSuccessNotice}</span>
      <button onclick={() => spawnSuccessNotice = null} class="text-emerald-400 hover:text-emerald-100">✕</button>
    </div>
  {/if}

  {#if stashNotice}
    <div class="px-4 py-1.5 bg-amber-900/80 border-b border-amber-600 text-amber-200 text-xs flex items-center justify-between shrink-0">
      <span>💰 {stashNotice}</span>
      <button onclick={() => stashNotice = null} class="text-amber-400 hover:text-amber-100">✕</button>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TAB 1: RELATIONAL LORE GRAPH WIKI                                       -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeSubView === 'wiki'}
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- ── Left Panel: Search, Category Filters, Entity Cards ───────────── -->
      <aside class="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0 overflow-hidden">
        <!-- Search bar -->
        <div class="p-3 border-b border-slate-800 space-y-2">
          <div class="relative">
            <span class="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search entities, tags, notes…"
              class="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            />
          </div>

          <!-- Category filter pills -->
          <div class="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-thin">
            {#each ['ALL', 'NPC', 'FACTION', 'LOCATION', 'QUEST', 'DOCUMENT'] as cat}
              <button
                onclick={() => typeFilter = cat as EntityType | 'ALL'}
                class="px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition-colors {typeFilter === cat ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
              >
                {cat}
              </button>
            {/each}
          </div>

          <!-- Tag chips -->
          {#if allTags.length > 0}
            <div class="flex items-center gap-1 overflow-x-auto pt-1 pb-0.5 text-[10px] scrollbar-thin">
              <span class="text-slate-600 uppercase font-bold shrink-0">Tags:</span>
              {#if selectedTag}
                <button
                  onclick={() => selectedTag = null}
                  class="px-1.5 py-0.5 bg-indigo-900 text-indigo-200 rounded font-medium shrink-0 flex items-center gap-1"
                >
                  <span>#{selectedTag}</span>
                  <span>✕</span>
                </button>
              {/if}
              {#each allTags as tag}
                {#if tag !== selectedTag}
                  <button
                    onclick={() => selectedTag = tag}
                    class="px-1.5 py-0.5 bg-slate-800/80 text-slate-400 hover:text-slate-200 rounded font-medium shrink-0 transition-colors"
                  >
                    #{tag}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <!-- Entity list -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
          {#if filteredEntities.length === 0}
            <div class="text-center py-10 text-slate-600 text-xs">
              <p class="text-2xl mb-1">🔍</p>
              <p>No lore entities match current query.</p>
            </div>
          {:else}
            {#each filteredEntities as entity (entity.id)}
              <button
                onclick={() => { loreGraphStore.activeEntityId = entity.id; isEditing = false; }}
                class="w-full text-left p-2.5 rounded-xl border transition-all {activeEntity?.id === entity.id ? 'bg-indigo-950/40 border-indigo-500/60 shadow-sm' : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-850 hover:border-slate-700'}"
              >
                <div class="flex items-center justify-between gap-1 mb-1">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-sm shrink-0">{TYPE_ICONS[entity.type]}</span>
                    <span class="text-xs font-bold text-slate-200 truncate">{entity.name}</span>
                  </div>
                  <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                    {entity.type}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{entity.summary}</p>
                <div class="flex items-center gap-1 mt-2 flex-wrap">
                  {#each entity.tags.slice(0, 3) as tag}
                    <span class="text-[9px] px-1 py-0.5 bg-slate-800/80 text-slate-500 rounded font-mono">#{tag}</span>
                  {/each}
                  {#if entity.attributes.cr}
                    <span class="text-[9px] px-1 py-0.5 bg-rose-950/60 text-rose-300 rounded font-bold">CR {entity.attributes.cr}</span>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </aside>

      <!-- ── Right Panel: Entity Dossier & Relationship Cards ─────────────── -->
      <main class="flex-1 flex flex-col overflow-y-auto min-w-0 bg-slate-950">
        {#if activeEntity}
          <div class="p-6 max-w-4xl w-full mx-auto space-y-6">
            <!-- Header section -->
            <div class="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="text-2xl">{TYPE_ICONS[activeEntity.type]}</span>
                  <h2 class="text-2xl font-black text-slate-100 tracking-tight">{activeEntity.name}</h2>
                  <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                    {activeEntity.type}
                  </span>
                </div>
                <p class="text-sm text-slate-400 max-w-2xl leading-relaxed">{activeEntity.summary}</p>
              </div>

              <!-- Header Action Buttons -->
              <div class="flex items-center gap-2 shrink-0">
                <button
                  onclick={handleSpawnToken}
                  class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                  title="Drop combatant token onto the Tactical Battle Mat"
                >
                  <span>⚔️</span>
                  <span>Spawn Token</span>
                </button>

                <!-- Secret Lore Dispatch Dropdown -->
                <div class="relative">
                  <button
                    onclick={() => showWhisperMenu = !showWhisperMenu}
                    class="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                    title="Send secret lore entry directly to player mobile inbox"
                  >
                    <span>📜</span>
                    <span>Whisper Entry ▾</span>
                  </button>

                  {#if showWhisperMenu}
                    <div class="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1">
                      <div class="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                        Select Recipient
                      </div>
                      <button
                        onclick={() => handleWhisperLore(undefined, 'Broadcast to Party')}
                        class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-indigo-950/70 hover:text-indigo-200 text-slate-300 font-semibold transition-colors flex items-center justify-between"
                      >
                        <span>📢 Broadcast to All</span>
                        <span class="text-[10px] text-slate-500 font-mono">Party</span>
                      </button>
                      {#each getConnectedPartyList() as member}
                        <button
                          onclick={() => handleWhisperLore(member.pin, member.name)}
                          class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors flex items-center justify-between"
                        >
                          <span class="truncate font-medium">{member.name}</span>
                          <span class="text-[10px] text-indigo-400 font-mono">PIN {member.pin}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if !isEditing}
                  <button
                    onclick={startEditing}
                    class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                  >
                    ✏️ Edit
                  </button>
                {:else}
                  <button
                    onclick={saveEditing}
                    class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    💾 Save
                  </button>
                  <button
                    onclick={() => isEditing = false}
                    class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                {/if}
              </div>
            </div>

            <!-- Attributes pill grid -->
            {#if Object.keys(activeEntity.attributes).length > 0}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {#each Object.entries(activeEntity.attributes) as [attrKey, attrVal]}
                  <div class="p-2.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <span class="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">{attrKey}</span>
                    <span class="text-xs font-semibold text-slate-200">{String(attrVal)}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Relational Links Graph Section -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>🔗</span>
                  <span>Relational Graph Links ({linkedRecords.length})</span>
                </h3>
                <button
                  onclick={() => { relTargetId = loreGraphStore.entities.find(e => e.id !== activeEntity.id)?.id || ''; showRelModal = true; }}
                  class="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add Link
                </button>
              </div>

              {#if linkedRecords.length === 0}
                <div class="p-3 bg-slate-900/30 border border-slate-800/80 rounded-xl text-center text-xs text-slate-500">
                  No relationships established for this entity yet. Click "+ Add Link" to establish connections.
                </div>
              {:else}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {#each linkedRecords as link}
                    <div class="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-start justify-between gap-3 group hover:border-slate-700 transition-colors">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs">{TYPE_ICONS[link.entity.type]}</span>
                          <button
                            onclick={() => { loreGraphStore.activeEntityId = link.entity.id; isEditing = false; }}
                            class="text-xs font-bold text-indigo-400 hover:text-indigo-200 truncate transition-colors text-left"
                          >
                            {link.entity.name}
                          </button>
                          <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border {RELATION_COLORS[link.relation.relationType]}">
                            {link.direction === 'outgoing' ? '→' : '←'} {link.relation.relationType.replace('_', ' ')}
                          </span>
                        </div>
                        {#if link.relation.notes}
                          <p class="text-[11px] text-slate-400 italic leading-relaxed">{link.relation.notes}</p>
                        {/if}
                      </div>
                      <button
                        onclick={() => loreGraphStore.removeRelationship(link.relation.id)}
                        class="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove relationship"
                      >
                        ✕
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Body Markdown Notes Section -->
            <div class="space-y-2 relative">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>📝</span>
                <span>Lore Dossier &amp; Campaign Notes</span>
              </h3>

              {#if isEditing}
                <div class="relative">
                  <textarea
                    bind:this={textareaEl}
                    bind:value={editBody}
                    oninput={handleBodyInput}
                    rows="14"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                    placeholder="Enter Markdown notes… type @ to link other entities."
                  ></textarea>

                  <!-- @mention dropdown autocomplete -->
                  {#if mentionQuery !== null && mentionSuggestions.length > 0}
                    <div
                      class="absolute z-30 w-64 bg-slate-900 border border-indigo-500/80 rounded-xl shadow-2xl p-1 overflow-hidden"
                      style="top: {mentionPos?.top || 38}px; left: {mentionPos?.left || 16}px;"
                    >
                      <div class="px-2 py-1 text-[10px] uppercase tracking-wider text-indigo-300 font-bold border-b border-slate-800">
                        Link Entity (@{mentionQuery})
                      </div>
                      {#each mentionSuggestions as sug}
                        <button
                          type="button"
                          onclick={() => insertMention(sug)}
                          class="w-full text-left px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded-lg flex items-center gap-2 text-xs text-slate-300 transition-colors"
                        >
                          <span>{TYPE_ICONS[sug.type]}</span>
                          <span class="font-semibold truncate">{sug.name}</span>
                          <span class="text-[9px] uppercase text-slate-500 ml-auto">{sug.type}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans space-y-2">
                  {activeEntity.bodyMarkdown}
                </div>
              {/if}
            </div>

            <!-- Danger Zone: Delete Entity -->
            <div class="pt-4 border-t border-slate-900 flex justify-end">
              <button
                onclick={() => {
                  if (confirm(`Delete entity "${activeEntity.name}" and all associated relationships?`)) {
                    loreGraphStore.deleteEntity(activeEntity.id);
                  }
                }}
                class="text-[11px] text-rose-500 hover:text-rose-400 transition-colors"
              >
                🗑️ Delete Record
              </button>
            </div>
          </div>
        {:else}
          <div class="h-full flex items-center justify-center text-slate-600 text-sm">
            Select an entity from the sidebar or create a new record.
          </div>
        {/if}
      </main>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TAB 2: PROCEDURAL TRADE MANIFEST GENERATOR                              -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeSubView === 'manifests'}
    <div class="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>📦</span>
              <span>Commercial Trade Manifest &amp; Cargo Ingestion</span>
            </h2>
            <p class="text-xs text-slate-400">Generates bulk commercial cargo bills with crate quantities, weights, and customs valuations.</p>
          </div>

          <div class="flex items-center gap-2">
            <button
              onclick={handleGenerateManifest}
              class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow"
            >
              🎲 Generate New Cargo
            </button>
            <button
              onclick={handleAddCargoToStash}
              disabled={!currentManifest}
              class="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1"
            >
              <span>💰</span>
              <span>Add Cargo to Party Stash</span>
            </button>
          </div>
        </div>

        <!-- Manifest Generation Controls -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Cargo Category</span>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              {#each ['CARAVAN', 'SHIP_CARGO', 'CONTRABAND'] as cat}
                <button
                  onclick={() => { manifestCategory = cat as ManifestCategory; handleGenerateManifest(); }}
                  class="py-1.5 px-2 rounded-lg font-semibold border transition-all {manifestCategory === cat ? 'bg-indigo-950 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}"
                >
                  {cat.replace('_', ' ')}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Value Tier</span>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              {#each ['MODEST', 'WEALTHY', 'ARISTOCRATIC'] as tier}
                <button
                  onclick={() => { manifestTier = tier as ManifestValueTier; handleGenerateManifest(); }}
                  class="py-1.5 px-2 rounded-lg font-semibold border transition-all {manifestTier === tier ? 'bg-amber-950 border-amber-500 text-amber-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}"
                >
                  {tier}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Rendered Trade Waybill / Bill of Lading -->
      {#if currentManifest}
        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <!-- Waybill Header -->
          <div class="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between flex-wrap gap-4">
            <div>
              <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                Official Bill of Lading · {currentManifest.manifestCode}
              </span>
              <h3 class="text-xl font-black text-slate-100 mt-0.5">{currentManifest.title}</h3>
              <p class="text-xs text-slate-400 mt-1">
                Carrier: <span class="text-slate-200 font-semibold">{currentManifest.carrier}</span> ·
                From: <span class="text-slate-200 font-semibold">{currentManifest.origin}</span> →
                To: <span class="text-slate-200 font-semibold">{currentManifest.destination}</span>
              </p>
            </div>

            <div class="flex items-center gap-4 text-right">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Total Crates</span>
                <span class="text-lg font-mono font-bold text-slate-200">{currentManifest.totalCrates}</span>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Gross Weight</span>
                <span class="text-lg font-mono font-bold text-slate-200">{currentManifest.totalWeightLbs.toLocaleString()} lbs</span>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Declared Customs Value</span>
                <span class="text-lg font-mono font-bold text-amber-400">{currentManifest.totalCustomsValueGp.toLocaleString()} GP</span>
              </div>
            </div>
          </div>

          <!-- Cargo Items Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <th class="p-3">Cargo Description</th>
                  <th class="p-3">Category</th>
                  <th class="p-3">Hazard</th>
                  <th class="p-3 text-right">Crates</th>
                  <th class="p-3 text-right">Weight/Crate</th>
                  <th class="p-3 text-right">Unit Price</th>
                  <th class="p-3 text-right">Total Customs</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                {#each currentManifest.items as item}
                  <tr class="hover:bg-slate-800/30 transition-colors">
                    <td class="p-3">
                      <p class="font-bold text-slate-200">{item.name}</p>
                      <p class="text-[11px] text-slate-500">{item.notes}</p>
                    </td>
                    <td class="p-3 text-slate-400">{item.category}</td>
                    <td class="p-3">
                      <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded {item.hazardRating === 'ILLICIT' ? 'bg-rose-950 text-rose-300 border border-rose-800' : item.hazardRating === 'VOLATILE' ? 'bg-amber-950 text-amber-300 border border-amber-800' : item.hazardRating === 'PERISHABLE' ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-slate-800 text-slate-400'}">
                        {item.hazardRating || 'SAFE'}
                      </span>
                    </td>
                    <td class="p-3 text-right font-mono font-bold text-slate-300">{item.crateCount}</td>
                    <td class="p-3 text-right font-mono text-slate-400">{item.weightLbsPerCrate} lbs</td>
                    <td class="p-3 text-right font-mono text-slate-400">{item.unitPriceGp} GP</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-400">{item.totalCustomsGp.toLocaleString()} GP</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- TAB 3: SANE MAGICAL PRICES CALCULATOR                                   -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeSubView === 'pricing'}
    <div class="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h2 class="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>🪙</span>
            <span>Sane Magical Prices: Algorithmic Utility Curve Valuation</span>
          </h2>
          <p class="text-xs text-slate-400 mt-1">
            Calculates balanced purchase prices using spell-level utility curves, combat scalars, permanent attunement premiums, and consumable discounts.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Controls -->
          <div class="space-y-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Item Rarity</span>
              <div class="grid grid-cols-3 gap-1.5 text-xs">
                {#each ['COMMON', 'UNCOMMON', 'RARE', 'VERY_RARE', 'LEGENDARY', 'ARTIFACT'] as rar}
                  <button
                    onclick={() => calcRarity = rar as ItemRarity}
                    class="py-1.5 px-2 rounded-lg font-semibold border transition-all {calcRarity === rar ? 'bg-indigo-950 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}"
                  >
                    {rar.replace('_', ' ')}
                  </button>
                {/each}
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                <span>Equivalent Spell Tier</span>
                <span class="font-mono text-indigo-400">{calcSpellLvl === 0 ? 'Cantrip (0)' : `Level ${calcSpellLvl}`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="9"
                step="1"
                bind:value={calcSpellLvl}
                class="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                <span>Combat Bonus Scalar (+X Weapon/Armor/DC)</span>
                <span class="font-mono text-amber-400">{calcCombatScalar === 0 ? 'None (+0)' : `+${calcCombatScalar}`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                bind:value={calcCombatScalar}
                class="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div class="flex items-center gap-6 pt-1">
              <label class="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input type="checkbox" bind:checked={calcAttunement} class="rounded accent-indigo-500" />
                <span>Requires Attunement (+35% Power Tax)</span>
              </label>
              <label class="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input type="checkbox" bind:checked={calcConsumable} class="rounded accent-indigo-500" />
                <span>Consumable / Single Use (-50% Discount)</span>
              </label>
            </div>

            <div>
              <span class="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">Utility Features</span>
              <div class="grid grid-cols-2 gap-1.5 text-xs">
                {#each ['FLIGHT', 'TELEPORTATION', 'DAMAGE_RESISTANCE', 'EXTRA_ACTION', 'HEALING', 'SENSES'] as feat}
                  <button
                    onclick={() => toggleUtilityFeature(feat as UtilityFeature)}
                    class="py-1.5 px-2 rounded-lg font-semibold border text-left flex items-center justify-between transition-all {calcUtilityFeatures.includes(feat as UtilityFeature) ? 'bg-emerald-950 border-emerald-500 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}"
                  >
                    <span>{feat.replace('_', ' ')}</span>
                    <span>{calcUtilityFeatures.includes(feat as UtilityFeature) ? '✓' : '+'}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Valuation Output Card -->
          <div class="flex flex-col justify-between p-6 bg-slate-950 border border-slate-800 rounded-2xl">
            <div class="space-y-4">
              <span class="text-[10px] uppercase font-bold tracking-widest text-slate-500">Calculated Sane Price</span>
              <div class="flex items-baseline gap-2">
                <span class="text-4xl font-black text-amber-400 font-mono">
                  {calculatedValuation.finalPriceGp.toLocaleString()}
                </span>
                <span class="text-base font-bold text-amber-500">GP</span>
              </div>

              <div class="space-y-2 pt-3 border-t border-slate-800 text-xs">
                <div class="flex justify-between text-slate-400">
                  <span>Rarity Baseline:</span>
                  <span class="font-mono text-slate-200">{calculatedValuation.basePriceGp} GP</span>
                </div>
                {#if calculatedValuation.spellCurveGp > 0}
                  <div class="flex justify-between text-slate-400">
                    <span>Spell Utility Adder:</span>
                    <span class="font-mono text-slate-200">+{calculatedValuation.spellCurveGp} GP</span>
                  </div>
                {/if}
                {#if calculatedValuation.utilityAddersGp > 0}
                  <div class="flex justify-between text-slate-400">
                    <span>Utility Feature Adders:</span>
                    <span class="font-mono text-slate-200">+{calculatedValuation.utilityAddersGp} GP</span>
                  </div>
                {/if}
                {#if calculatedValuation.combatScalarMultiplier > 1}
                  <div class="flex justify-between text-slate-400">
                    <span>Combat Multiplier:</span>
                    <span class="font-mono text-amber-300">×{calculatedValuation.combatScalarMultiplier}</span>
                  </div>
                {/if}
                {#if calculatedValuation.attunementMultiplier > 1}
                  <div class="flex justify-between text-slate-400">
                    <span>Attunement Tax:</span>
                    <span class="font-mono text-indigo-300">+35%</span>
                  </div>
                {/if}
                {#if calculatedValuation.consumableDiscountMultiplier < 1}
                  <div class="flex justify-between text-slate-400">
                    <span>Consumable Discount:</span>
                    <span class="font-mono text-emerald-300">-50%</span>
                  </div>
                {/if}
              </div>
            </div>

            <div class="mt-6 p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed font-mono">
              {calculatedValuation.priceExplanation}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- ── MODAL: Create New Lore Entity ───────────────────────────────────────── -->
{#if showNewEntityModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>+</span>
          <span>New Lore Entity</span>
        </h3>
        <button onclick={() => showNewEntityModal = false} class="text-slate-500 hover:text-slate-300 text-xs">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="new-entity-type" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Entity Type</label>
          <select
            id="new-entity-type"
            bind:value={newType}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="NPC">NPC (Non-Player Character)</option>
            <option value="FACTION">Faction / Organization</option>
            <option value="LOCATION">Location / Stronghold</option>
            <option value="QUEST">Quest / Objective</option>
            <option value="DOCUMENT">Document / Treaty</option>
          </select>
        </div>

        <div>
          <label for="new-entity-name" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Name</label>
          <input
            id="new-entity-name"
            type="text"
            bind:value={newName}
            placeholder="Entity name…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
          />
        </div>

        <div>
          <label for="new-entity-summary" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Brief Summary</label>
          <input
            id="new-entity-summary"
            type="text"
            bind:value={newSummary}
            placeholder="One-line summary description…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {#if newType === 'NPC'}
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="new-entity-cr" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Challenge Rating (CR)</label>
              <input
                id="new-entity-cr"
                type="number"
                min="0"
                max="30"
                bind:value={newCr}
                class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label for="new-entity-alignment" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Alignment</label>
              <input
                id="new-entity-alignment"
                type="text"
                bind:value={newAlignment}
                placeholder="e.g. Lawful Good"
                class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
              />
            </div>
          </div>
        {/if}

        <div>
          <label for="new-entity-tags" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Tags (Comma-separated)</label>
          <input
            id="new-entity-tags"
            type="text"
            bind:value={newTags}
            placeholder="mercenary, military, cr-8"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none font-mono text-[11px]"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
        <button onclick={() => showNewEntityModal = false} class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
          Cancel
        </button>
        <button onclick={handleCreateEntity} disabled={!newName.trim()} class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shadow">
          Create Entity
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── MODAL: Add Relationship Link ────────────────────────────────────────── -->
{#if showRelModal && activeEntity}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>🔗</span>
          <span>Add Graph Link from "{activeEntity.name}"</span>
        </h3>
        <button onclick={() => showRelModal = false} class="text-slate-500 hover:text-slate-300 text-xs">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="rel-type-select" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Relationship Type</label>
          <select
            id="rel-type-select"
            bind:value={relType}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="ALLIED_WITH">ALLIED WITH</option>
            <option value="ENEMY_OF">ENEMY OF</option>
            <option value="LOCATED_IN">LOCATED IN</option>
            <option value="MEMBER_OF">MEMBER OF</option>
            <option value="CONTROLS">CONTROLS</option>
          </select>
        </div>

        <div>
          <label for="rel-target-select" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Target Entity</label>
          <select
            id="rel-target-select"
            bind:value={relTargetId}
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {#each loreGraphStore.entities.filter(e => e.id !== activeEntity.id) as target}
              <option value={target.id}>{TYPE_ICONS[target.type]} {target.name} ({target.type})</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="rel-notes-input" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Relationship Notes (Optional)</label>
          <input
            id="rel-notes-input"
            type="text"
            bind:value={relNotes}
            placeholder="e.g. Sworn blood pact signed after the siege…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none text-[11px]"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
        <button onclick={() => showRelModal = false} class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
          Cancel
        </button>
        <button onclick={handleAddRelationship} disabled={!relTargetId} class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shadow">
          Establish Link
        </button>
      </div>
    </div>
  </div>
{/if}
