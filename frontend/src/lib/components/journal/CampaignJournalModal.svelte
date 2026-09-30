<!-- frontend/src/lib/components/journal/CampaignJournalModal.svelte -->
<!-- Markdown Journal, Campaign Handouts & Compendium Entity Linker (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { compendiumDb, type CompendiumMonster, type CompendiumSpell, type CompendiumItem, type CompendiumRule } from '../../db/compendiumDb';
  import { sendWsEvent } from '../../../stores/websocketStore';
  import { broadcaster } from '../../services/broadcaster';
  import StatblockDrawer, { type SelectedCompendiumEntry } from '../compendium/StatblockDrawer.svelte';

  let {
    isOpen = $bindable(false),
    onClose = () => { isOpen = false; },
    initialTitle = 'Campaign Journal & Session Handout',
    initialMarkdown = '',
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    initialTitle?: string;
    initialMarkdown?: string;
  } = $props();

  let title = $state(initialTitle);
  let markdown = $state(
    initialMarkdown ||
    `# The Ancient Barrow-Downs

The adventurers descend into the forgotten crypt beneath the Whispering Weald.

## Active Encounters
Standing guard at the iron gates is a [[Monster: Goblin]] sentry armed with a barbed spear.
Behind the altar, an apprentice cultist prepares to cast [[Spell: Fireball]] upon intrusion.

## Recovered Equipment
- [[Item: Potion of Healing]] (Uncommon)
- Ancient brass astrolabe

:::secret [DM Eyes Only]
The sarcophagus contains a false bottom hiding a trapped glyph. DC 15 Perception to spot the trigger wires.
:::

> Note: Consult [[Rule: Concentration]] when damage occurs during spell channeling.`
  );

  let isDmView = $state(true); // Toggle DM/Player visibility
  let isEditing = $state(false);
  let toastMessage = $state<string | null>(null);

  // Statblock Drawer state for [[Tag]] clicks
  let isStatblockOpen = $state(false);
  let selectedStatblockEntry = $state<SelectedCompendiumEntry | null>(null);

  // Entity cache for quick link resolution
  const compendiumCache = new Map<string, SelectedCompendiumEntry | null>();

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2800);
  }

  // ── Entity Resolver for [[Category: Name]] or [[Name]] ─────────────────────
  async function resolveCompendiumEntity(tag: string): Promise<SelectedCompendiumEntry | null> {
    let cleanTag = tag.trim();
    let categoryHint: string | null = null;
    if (cleanTag.includes(':')) {
      const parts = cleanTag.split(':');
      categoryHint = parts[0].trim().toLowerCase();
      cleanTag = parts.slice(1).join(':').trim();
    }
    const lower = cleanTag.toLowerCase();
    const cacheKey = categoryHint ? `${categoryHint}:${lower}` : lower;
    if (compendiumCache.has(cacheKey)) {
      return compendiumCache.get(cacheKey)!;
    }

    if (!categoryHint || categoryHint === 'monster') {
      const monster = await compendiumDb.monsters
        .filter(m => m.name.toLowerCase() === lower)
        .first();
      if (monster) {
        const entry: SelectedCompendiumEntry = { type: 'monster', data: monster };
        compendiumCache.set(cacheKey, entry);
        return entry;
      }
    }

    if (!categoryHint || categoryHint === 'spell') {
      const spell = await compendiumDb.spells
        .filter(s => s.name.toLowerCase() === lower)
        .first();
      if (spell) {
        const entry: SelectedCompendiumEntry = { type: 'spell', data: spell };
        compendiumCache.set(cacheKey, entry);
        return entry;
      }
    }

    if (!categoryHint || categoryHint === 'item') {
      const item = await compendiumDb.items
        .filter(i => i.name.toLowerCase() === lower)
        .first();
      if (item) {
        const entry: SelectedCompendiumEntry = { type: 'item', data: item };
        compendiumCache.set(cacheKey, entry);
        return entry;
      }
    }

    if (!categoryHint || categoryHint === 'rule') {
      const rule = await compendiumDb.rules
        .filter(r => r.title.toLowerCase() === lower)
        .first();
      if (rule) {
        const entry: SelectedCompendiumEntry = { type: 'rule', data: rule };
        compendiumCache.set(cacheKey, entry);
        return entry;
      }
    }

    compendiumCache.set(cacheKey, null);
    return null;
  }

  async function handleTagClick(tag: string) {
    const entry = await resolveCompendiumEntity(tag);
    if (entry) {
      selectedStatblockEntry = entry;
      isStatblockOpen = true;
    } else {
      showToast(`No compendium entry found for "${tag}"`);
    }
  }

  // ── Broadcast Handout to Player Screens ────────────────────────────────────
  function broadcastToPlayers() {
    if (!title && !markdown) return;

    // Redact secret callouts if broadcasting to player devices
    const playerContent = markdown.replace(/:::secret[\s\S]*?:::/g, '').trim();

    const imgMatch = playerContent.match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;
    const handoutId = `handout-${Date.now()}`;

    // 1. Broadcast over primary WebSocket hub
    sendWsEvent({
      type: 'HANDOUT',
      id: handoutId,
      title,
      content: playerContent,
      image_url: imageUrl,
    });

    // 2. Cross-window broadcast for local companion tabs
    broadcaster.showHandout({
      id: handoutId,
      title,
      content: playerContent,
      image_url: imageUrl || undefined,
      url: imageUrl || '',
    });

    showToast(`Handout "${title}" broadcast to player devices!`);
  }

  // ── Markdown AST & Safe HTML Tokenizer ─────────────────────────────────────
  function parseMarkdown(src: string, isDm: boolean): string {
    if (!src) return '';

    let text = src;

    // Filter secret callouts based on visibility mode
    if (!isDm) {
      text = text.replace(/:::secret[\s\S]*?:::/g, '');
    } else {
      text = text.replace(/:::secret\s*(\[.*?\])?\s*([\s\S]*?):::/g, (_m, header, body) => {
        const titleText = header ? header.replace(/[[\]]/g, '') : 'DM Secret Note';
        return `<div class="my-4 border-l-4 border-amber-500 bg-amber-950/30 p-3 rounded-r-lg text-amber-200">
          <div class="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1.5">
            <span>🔒</span> ${titleText}
          </div>
          <div class="text-sm opacity-90">${body.trim()}</div>
        </div>`;
      });
    }

    // Process wikilinks: [[Category: Name]] or [[Name]]
    text = text.replace(/\[\[(.*?)\]\]/g, (_match, rawTag) => {
      const tag = rawTag.trim();
      let icon = '📖';
      const lower = tag.toLowerCase();
      if (lower.startsWith('monster:') || lower.startsWith('creature:')) icon = '🐉';
      else if (lower.startsWith('spell:')) icon = '✨';
      else if (lower.startsWith('item:')) icon = '🛡️';
      else if (lower.startsWith('rule:') || lower.startsWith('condition:')) icon = '⚖️';

      return `<button
        type="button"
        class="journal-wikilink-btn inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-full text-xs font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900/90 hover:border-indigo-400 hover:text-indigo-100 transition-all cursor-pointer select-none"
        data-tag="${encodeURIComponent(tag)}"
      >
        <span class="text-[10px] opacity-75">${icon}</span>
        <span>${tag}</span>
      </button>`;
    });

    // Headers
    text = text.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-slate-200 mt-4 mb-2">$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-indigo-300 mt-5 mb-2 pb-1 border-b border-slate-800">$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-amber-300 mt-2 mb-4">$1</h1>');

    // Blockquotes
    text = text.replace(/^\> (.*$)/gim, '<blockquote class="border-l-2 border-indigo-500/80 pl-3 py-1 my-2 text-slate-400 italic bg-slate-900/50 rounded-r">$1</blockquote>');

    // Bold & Italics
    text = text.replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-slate-100">$1</strong>');
    text = text.replace(/\*(.*?)\*/gim, '<em class="italic text-slate-300">$1</em>');

    // Unordered lists
    text = text.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-300">$1</li>');

    // Paragraph breaks
    text = text.replace(/\n\n+/g, '<div class="h-3"></div>');

    return text;
  }

  function handleContainerClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest('.journal-wikilink-btn');
    if (btn) {
      const rawTag = btn.getAttribute('data-tag');
      if (rawTag) {
        handleTagClick(decodeURIComponent(rawTag));
      }
    }
  }

  onMount(async () => {
    await compendiumDb.ensureSrdBaseline();
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100"
    role="presentation"
    onclick={() => onClose()}
  >
    <!-- Modal Dialog -->
    <div
      class="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      role="dialog"
      tabindex="-1"
      aria-label="Campaign Journal & Handouts"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <span class="text-2xl">📜</span>
          <input
            bind:value={title}
            type="text"
            class="bg-transparent text-lg font-bold text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1.5 py-0.5"
            placeholder="Journal Title..."
          />
        </div>

        <div class="flex items-center gap-2">
          <!-- DM / Player Visibility Toggle -->
          <button
            type="button"
            onclick={() => isDmView = !isDmView}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors {isDmView ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'}"
            title="Toggle between DM view (secrets visible) and Player view (secrets redacted)"
          >
            <span>{isDmView ? '🔒 DM View' : '👁️ Player View'}</span>
          </button>

          <!-- Edit / Preview Toggle -->
          <button
            type="button"
            onclick={() => isEditing = !isEditing}
            class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 border border-slate-700 transition-colors"
          >
            {isEditing ? 'View Preview' : 'Edit Markdown'}
          </button>

          <!-- Broadcast Button -->
          <button
            type="button"
            onclick={broadcastToPlayers}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
          >
            <span>📡</span> Broadcast Handout
          </button>

          <!-- Close Modal -->
          <button
            type="button"
            onclick={() => onClose()}
            class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center transition-colors ml-2"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="flex-1 overflow-y-auto p-6 min-h-[350px]">
        {#if isEditing}
          <textarea
            bind:value={markdown}
            class="w-full h-full min-h-[350px] bg-slate-950/60 text-slate-200 font-mono text-sm p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Type campaign notes in Markdown. Use [[Monster: Goblin]] or [[Spell: Fireball]] for interactive links..."
          ></textarea>
        {:else}
          <!-- Rendered Markdown Container with Delegated Wikilink Clicks -->
          <div
            role="region"
            aria-label="Handout content"
            class="prose prose-invert max-w-none text-slate-200 leading-relaxed"
            onclick={handleContainerClick}
          >
            {@html parseMarkdown(markdown, isDmView)}
          </div>
        {/if}
      </div>

      <!-- Toast Feedback -->
      {#if toastMessage}
        <div class="px-6 py-2 bg-indigo-950/90 border-t border-indigo-800 text-xs font-medium text-indigo-300 flex items-center justify-between">
          <span>{toastMessage}</span>
          <button type="button" onclick={() => toastMessage = null} class="text-indigo-400 hover:text-indigo-200">✕</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Compendium Statblock Drawer for Clicked Wikilinks -->
<StatblockDrawer
  bind:isOpen={isStatblockOpen}
  entry={selectedStatblockEntry}
  onClose={() => { isStatblockOpen = false; }}
/>
