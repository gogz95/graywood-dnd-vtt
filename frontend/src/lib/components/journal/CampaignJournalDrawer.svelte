<!-- frontend/src/lib/components/journal/CampaignJournalDrawer.svelte -->
<!-- DM Campaign Journal with Compendium Auto-Linking & Player Handout Broadcaster (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { compendiumDb, type CompendiumMonster, type CompendiumSpell, type CompendiumItem, type CompendiumRule } from '../../db/compendiumDb';
  import { campaignDirectoryStore } from '../../stores/campaignDirectoryStore.svelte';
  import { sendWsEvent } from '../../../stores/websocketStore';
  import { broadcaster } from '../../services/broadcaster';
  import StatblockDrawer, { type SelectedCompendiumEntry } from '../compendium/StatblockDrawer.svelte';

  let {
    isOpen = $bindable(false),
    onClose = () => { isOpen = false; }
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  export interface JournalNote {
    filename: string;
    title: string;
    content: string;
    lastSaved?: number;
    category: string;
  }

  // Active notes state
  let notes = $state<JournalNote[]>([]);
  let activeFilename = $state<string>('');
  let activeContent = $state<string>('');
  let activeTitle = $state<string>('');
  let searchQuery = $state<string>('');
  let viewMode = $state<'split' | 'edit' | 'preview'>('split');
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let toastMessage = $state<string | null>(null);

  // Auto-save debouncer
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Statblock Drawer state for [[Tag]] clicks
  let isStatblockOpen = $state(false);
  let selectedStatblockEntry = $state<SelectedCompendiumEntry | null>(null);

  // Hover Tooltip state
  let hoveredTag = $state<string | null>(null);
  let tooltipData = $state<{
    title: string;
    type: 'monster' | 'spell' | 'item' | 'rule' | 'unknown';
    subtitle: string;
    details: string;
  } | null>(null);
  let tooltipPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  // Cache for resolved compendium entities
  const compendiumCache = new Map<string, SelectedCompendiumEntry | null>();

  // Filtered notes by search query
  let filteredNotes = $derived(
    notes.filter(n =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.filename.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let activeNote = $derived(
    notes.find(n => n.filename === activeFilename) ?? null
  );

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2800);
  }

  // Initial Seed Note if journal is empty
  const DEFAULT_NOTE_CONTENT = `# The Whispering Cairn

The party enters the ancient tomb carved into the limestone bluffs of the Cairn Hills.
Moisture drips from the ceiling, echoing in the darkness.

## Encounter: Goblin Scout
Standing near the rusted bronze sarcophagus is a [[Goblin]] guard clutching a jagged spear.
If threatened, it attempts to blow a signal whistle.

## Spell Prepared:
The mage prepares [[Fireball]] in case reinforcements emerge from the lower gallery.

## Discovered Relics:
Upon inspecting the altar, the adventurers locate a [[Potion of Healing]] and a weathered silver ring.

> Beware: [[Conditions]] in this tomb include magical darkness and slippery floor terrain.
`;

  onMount(async () => {
    await compendiumDb.ensureSrdBaseline();
    await loadJournalFiles();
  });

  onDestroy(() => {
    if (saveTimeout) clearTimeout(saveTimeout);
  });

  async function loadJournalFiles() {
    try {
      const allAssets = await campaignDirectoryStore.loadAssetList();
      const journalFiles = allAssets.filter(f => {
        const l = f.toLowerCase();
        return (l.startsWith('journal/') || l.startsWith('journal\\')) && (l.endsWith('.md') || l.endsWith('.txt'));
      });

      const loadedNotes: JournalNote[] = [];

      for (const relPath of journalFiles) {
        const filename = relPath.replace(/^journal[/\\]/, '');
        try {
          const res = await fetch(`/api/campaign/assets/${relPath.replace(/\\/g, '/')}`);
          if (res.ok) {
            const text = await res.text();
            const firstHeader = text.match(/^#\s+(.+)$/m);
            const title = firstHeader ? firstHeader[1].trim() : filename.replace(/\.[^/.]+$/, '');
            loadedNotes.push({
              filename,
              title,
              content: text,
              lastSaved: Date.now(),
              category: 'General Notes'
            });
          }
        } catch {
          // ignore error loading individual note
        }
      }

      if (loadedNotes.length === 0) {
        // Create initial default note
        const defaultFilename = 'whispering-cairn.md';
        loadedNotes.push({
          filename: defaultFilename,
          title: 'The Whispering Cairn',
          content: DEFAULT_NOTE_CONTENT,
          lastSaved: Date.now(),
          category: 'Adventure'
        });
        // Save initial note to disk
        saveNoteToDisk(defaultFilename, DEFAULT_NOTE_CONTENT);
      }

      notes = loadedNotes;
      if (notes.length > 0 && !activeFilename) {
        selectNote(notes[0]);
      }
    } catch (err) {
      console.warn('Failed to load journal files from campaign directory:', err);
    }
  }

  function selectNote(note: JournalNote) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      triggerSave();
    }
    activeFilename = note.filename;
    activeContent = note.content;
    activeTitle = note.title;
    saveStatus = 'idle';
  }

  function createNewNote() {
    const timestamp = Date.now();
    const filename = `note-${notes.length + 1}.md`;
    const newNote: JournalNote = {
      filename,
      title: `Untitled Note ${notes.length + 1}`,
      content: `# Untitled Note ${notes.length + 1}\n\nStart writing notes here... Use [[Goblin]] or [[Fireball]] to link compendium entries.`,
      lastSaved: timestamp,
      category: 'General'
    };
    notes = [newNote, ...notes];
    selectNote(newNote);
    triggerSave();
    showToast(`Created ${filename}`);
  }

  function handleContentInput(newVal: string) {
    activeContent = newVal;
    saveStatus = 'saving';

    // Auto extract title from first # header if present
    const headerMatch = newVal.match(/^#\s+(.+)$/m);
    if (headerMatch && headerMatch[1].trim()) {
      activeTitle = headerMatch[1].trim();
      const n = notes.find(item => item.filename === activeFilename);
      if (n) n.title = activeTitle;
    }

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      triggerSave();
    }, 1000);
  }

  async function triggerSave() {
    if (!activeFilename) return;
    saveStatus = 'saving';
    const success = await saveNoteToDisk(activeFilename, activeContent);
    if (success) {
      saveStatus = 'saved';
      const n = notes.find(item => item.filename === activeFilename);
      if (n) {
        n.content = activeContent;
        n.title = activeTitle;
        n.lastSaved = Date.now();
      }
    } else {
      saveStatus = 'error';
    }
  }

  async function saveNoteToDisk(filename: string, content: string): Promise<boolean> {
    try {
      // Base64 encode UTF-8 string safely
      const utf8Bytes = new TextEncoder().encode(content);
      let binaryStr = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
      }
      const base64 = btoa(binaryStr);

      const res = await campaignDirectoryStore.saveAsset('journal', filename, base64);
      return res.success;
    } catch (err) {
      console.error(`Failed to save note ${filename}:`, err);
      return false;
    }
  }

  // ── Compendium Entity Resolver & Parsing ──────────────────────────────────
  async function resolveCompendiumEntity(tag: string): Promise<SelectedCompendiumEntry | null> {
    const cleanTag = tag.trim();
    const lower = cleanTag.toLowerCase();
    if (compendiumCache.has(lower)) {
      return compendiumCache.get(lower)!;
    }

    // 1. Check monsters
    const monster = await compendiumDb.monsters
      .filter(m => m.name.toLowerCase() === lower)
      .first();
    if (monster) {
      const entry: SelectedCompendiumEntry = { type: 'monster', data: monster };
      compendiumCache.set(lower, entry);
      return entry;
    }

    // 2. Check spells
    const spell = await compendiumDb.spells
      .filter(s => s.name.toLowerCase() === lower)
      .first();
    if (spell) {
      const entry: SelectedCompendiumEntry = { type: 'spell', data: spell };
      compendiumCache.set(lower, entry);
      return entry;
    }

    // 3. Check items
    const item = await compendiumDb.items
      .filter(i => i.name.toLowerCase() === lower)
      .first();
    if (item) {
      const entry: SelectedCompendiumEntry = { type: 'item', data: item };
      compendiumCache.set(lower, entry);
      return entry;
    }

    // 4. Check rules
    const rule = await compendiumDb.rules
      .filter(r => r.title.toLowerCase() === lower)
      .first();
    if (rule) {
      const entry: SelectedCompendiumEntry = { type: 'rule', data: rule };
      compendiumCache.set(lower, entry);
      return entry;
    }

    compendiumCache.set(lower, null);
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

  async function handleTagHover(event: MouseEvent, tag: string) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipPos = { x: rect.left, y: rect.bottom + 6 };
    hoveredTag = tag;

    const entry = await resolveCompendiumEntity(tag);
    if (entry) {
      if (entry.type === 'monster') {
        const m = entry.data as CompendiumMonster;
        tooltipData = {
          title: m.name,
          type: 'monster',
          subtitle: `CR ${m.cr ?? '—'} • ${m.size} ${m.type}`,
          details: `AC ${m.ac} • HP ${m.hp} • Speed ${m.speed}`
        };
      } else if (entry.type === 'spell') {
        const s = entry.data as CompendiumSpell;
        tooltipData = {
          title: s.name,
          type: 'spell',
          subtitle: `Level ${s.level} ${s.school}`,
          details: `Cast: ${s.castingTime || s.casting_time} • Range: ${s.range} • Dur: ${s.duration}`
        };
      } else if (entry.type === 'item') {
        const i = entry.data as CompendiumItem;
        tooltipData = {
          title: i.name,
          type: 'item',
          subtitle: `${i.rarity} ${i.type}`,
          details: i.description ? i.description.slice(0, 110) + '...' : 'Standard item'
        };
      } else if (entry.type === 'rule') {
        const r = entry.data as CompendiumRule;
        tooltipData = {
          title: r.title,
          type: 'rule',
          subtitle: r.category || '5e Rule',
          details: r.content ? r.content.slice(0, 110) + '...' : 'Rules reference'
        };
      }
    } else {
      tooltipData = {
        title: tag,
        type: 'unknown',
        subtitle: 'Custom Entity',
        details: 'Double-bracket reference without matching 5e SRD statblock.'
      };
    }
  }

  function handleTagLeave() {
    hoveredTag = null;
    tooltipData = null;
  }

  // ── Player Handout Broadcaster ────────────────────────────────────────────
  function broadcastHandout() {
    if (!activeTitle && !activeContent) return;

    // Detect first image url if present in markdown: ![alt](url)
    const imgMatch = activeContent.match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    const handoutId = `handout-${Date.now()}`;

    // 1. Broadcast over Primary WebSocket
    sendWsEvent({
      type: 'HANDOUT',
      id: handoutId,
      title: activeTitle,
      content: activeContent,
      image_url: imageUrl
    });

    // 2. Broadcast over cross-window broadcaster (BroadcastChannel + LocalStorage)
    broadcaster.showHandout({
      id: handoutId,
      title: activeTitle,
      content: activeContent,
      image_url: imageUrl || undefined,
      url: imageUrl || ''
    });

    showToast(`Handout "${activeTitle}" broadcast to player devices!`);
  }

  // Lightweight native Markdown to Safe HTML Tokenizer with [[Tag]] Chip Replacement
  function renderMarkdownToHtml(markdown: string): string {
    if (!markdown) return '';

    let html = markdown
      // Escape raw HTML tags
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-800">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-amber-200 mt-5 mb-2 pb-1 border-b border-zinc-800">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold text-zinc-100 mt-2 mb-3 pb-1.5 border-b border-zinc-700/80">$1</h1>')
      // Blockquotes
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-amber-500/70 pl-3 py-1 my-3 italic text-zinc-300 bg-amber-500/5 rounded-r">$1</blockquote>')
      // Bold & Italic
      .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-zinc-100">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic text-zinc-300">$1</em>')
      // Images ![alt](url)
      .replace(/!\[(.*?)\]\((.*?)\)/gim, '<div class="my-3 rounded-lg overflow-hidden border border-zinc-800"><img src="$2" alt="$1" class="max-h-64 mx-auto object-contain" /><p class="text-[11px] text-center text-zinc-500 py-1 bg-zinc-900/60">$1</p></div>')
      // Standard links
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener" class="text-sky-400 hover:underline">$1</a>')
      // Unordered lists
      .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-zinc-300 mb-1">$1</li>')
      // Line breaks
      .replace(/\n\n/gim, '</p><p class="my-2.5 leading-relaxed text-zinc-300">');

    // Replace [[Compendium Tag]] with interactive chip buttons
    html = html.replace(/\[\[(.*?)\]\]/g, (_match, tag) => {
      const clean = tag.trim();
      return `<button type="button" class="compendium-chip inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-full text-xs font-medium bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer transition-all active:scale-95" data-tag="${clean}">
        <span class="text-[10px]">✨</span>
        <span>${clean}</span>
      </button>`;
    });

    return `<div class="prose prose-invert max-w-none text-sm text-zinc-200">${html}</div>`;
  }

  function handlePreviewClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest('.compendium-chip') as HTMLElement | null;
    if (target && target.dataset.tag) {
      e.preventDefault();
      handleTagClick(target.dataset.tag);
    }
  }

  function handlePreviewMouseOver(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest('.compendium-chip') as HTMLElement | null;
    if (target && target.dataset.tag) {
      handleTagHover(e, target.dataset.tag);
    }
  }
</script>

{#if isOpen}
  <!-- Drawer Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
  >
    <!-- Slide-over Drawer Panel -->
    <div class="w-full max-w-5xl h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in slide-in-from-right duration-200">
      <!-- Drawer Top Bar -->
      <header class="p-3.5 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">📖</span>
          <div>
            <h2 class="text-base font-bold text-zinc-100 flex items-center gap-2">
              <span>DM Campaign Journal</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                5e Compendium Linked
              </span>
            </h2>
            <p class="text-xs text-zinc-400">Disk-backed Markdown • Auto-save • Player Handout Broadcaster</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Push to Players Button -->
          <button
            onclick={broadcastHandout}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 flex items-center gap-1.5 transition-all active:scale-95"
            title="Broadcast active note / clue to all player companion phones and projector"
          >
            <span>📡</span>
            <span>Push to Players</span>
          </button>

          <!-- Close Drawer -->
          <button
            onclick={onClose}
            class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Close Journal"
          >
            ✕
          </button>
        </div>
      </header>

      <!-- Split Pane Container -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Pane: Note Hierarchy Tree -->
        <aside class="w-72 border-r border-zinc-800 bg-zinc-900/40 flex flex-col overflow-hidden">
          <!-- Search & New Note Header -->
          <div class="p-3 border-b border-zinc-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Notes ({notes.length})</span>
              <button
                onclick={createNewNote}
                class="px-2 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition-colors"
              >
                <span>+</span> New Note
              </button>
            </div>
            <input
              type="text"
              placeholder="Search notes..."
              bind:value={searchQuery}
              class="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <!-- Notes List -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            {#each filteredNotes as note (note.filename)}
              <button
                onclick={() => selectNote(note)}
                class="w-full text-left p-2.5 rounded-lg border transition-all {note.filename === activeFilename ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' : 'bg-zinc-900/30 border-transparent hover:bg-zinc-800/60 text-zinc-300'}"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold truncate flex items-center gap-1.5">
                    <span>📄</span> {note.title}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[10px] text-zinc-500">
                  <span class="font-mono truncate">{note.filename}</span>
                  {#if note.lastSaved}
                    <span>Saved</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </aside>

        <!-- Right Pane: Active Markdown Editor & Entity Viewer -->
        <main class="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
          <!-- Active Note Toolbar -->
          <div class="px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm font-semibold text-zinc-200 truncate">{activeTitle || activeFilename}</span>
              <!-- Save Status Pill -->
              {#if saveStatus === 'saving'}
                <span class="text-[10px] font-medium text-amber-400 flex items-center gap-1">
                  <span class="animate-spin text-xs">⟳</span> Saving...
                </span>
              {:else if saveStatus === 'saved'}
                <span class="text-[10px] font-medium text-emerald-400">● Auto-saved</span>
              {:else if saveStatus === 'error'}
                <span class="text-[10px] font-medium text-red-400">⚠ Save failed</span>
              {/if}
            </div>

            <!-- View Mode Switcher -->
            <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                onclick={() => viewMode = 'edit'}
                class="px-2.5 py-1 rounded transition-colors {viewMode === 'edit' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-zinc-200'}"
              >
                Edit
              </button>
              <button
                onclick={() => viewMode = 'split'}
                class="px-2.5 py-1 rounded transition-colors {viewMode === 'split' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-zinc-200'}"
              >
                Split
              </button>
              <button
                onclick={() => viewMode = 'preview'}
                class="px-2.5 py-1 rounded transition-colors {viewMode === 'preview' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-zinc-200'}"
              >
                Preview
              </button>
            </div>
          </div>

          <!-- Editor / Viewer Body -->
          <div class="flex-1 flex overflow-hidden">
            <!-- Markdown Raw Editor -->
            {#if viewMode === 'edit' || viewMode === 'split'}
              <div class="flex-1 flex flex-col border-r border-zinc-800/80 bg-zinc-950 p-3">
                <textarea
                  value={activeContent}
                  oninput={(e) => handleContentInput((e.target as HTMLTextAreaElement).value)}
                  placeholder="Write session notes in Markdown... Type [[Goblin]] or [[Fireball]] to auto-link compendium statblocks."
                  class="flex-1 w-full p-2 bg-transparent text-zinc-200 font-mono text-xs leading-relaxed resize-none focus:outline-none"
                  spellcheck="false"
                ></textarea>
                <div class="pt-2 border-t border-zinc-900 text-[10px] text-zinc-500 flex justify-between">
                  <span>Markdown Syntax Supported • Double-bracket [[Name]] links entity</span>
                  <span>{activeContent.length} chars</span>
                </div>
              </div>
            {/if}

            <!-- Rendered Markdown & Compendium Chip View -->
            {#if viewMode === 'preview' || viewMode === 'split'}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="flex-1 overflow-y-auto p-4 bg-zinc-950/80"
                onclick={handlePreviewClick}
                onmouseover={handlePreviewMouseOver}
                onmouseleave={handleTagLeave}
              >
                {@html renderMarkdownToHtml(activeContent)}
              </div>
            {/if}
          </div>
        </main>
      </div>
    </div>
  </div>
{/if}

<!-- Hover Tooltip Card for [[Tag]] -->
{#if hoveredTag && tooltipData}
  <div
    class="fixed z-[60] pointer-events-none bg-zinc-900 border border-amber-500/50 rounded-lg p-3 shadow-2xl w-64 text-zinc-100 animate-in fade-in zoom-in-95 duration-150"
    style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
  >
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs font-bold text-amber-200">{tooltipData.title}</span>
      <span class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
        {tooltipData.type}
      </span>
    </div>
    <div class="text-[11px] text-zinc-300 font-medium mb-1">{tooltipData.subtitle}</div>
    <p class="text-[10px] text-zinc-400 leading-snug">{tooltipData.details}</p>
    <div class="mt-2 text-[9px] text-amber-400/80 border-t border-zinc-800 pt-1 flex items-center gap-1">
      <span>👆 Click to inspect full 5e statblock</span>
    </div>
  </div>
{/if}

<!-- Slide-out Statblock Drawer -->
<StatblockDrawer
  bind:isOpen={isStatblockOpen}
  entry={selectedStatblockEntry}
  onClose={() => { isStatblockOpen = false; }}
/>

<!-- Toast Banner -->
{#if toastMessage}
  <div class="fixed bottom-6 right-6 z-[70] bg-zinc-900 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
    <span>✅</span>
    <span>{toastMessage}</span>
  </div>
{/if}
