<!-- src/lib/components/journal/JournalDrawer.svelte -->
<!-- DM Slide-Out Compendium Drawer for Campaign Notes with Dual Markdown & Blob Dropzone -->
<script lang="ts">
  import type { JournalEntry } from '$lib/types/journal';
  import { journalDb } from '$lib/db/journalDb';
  import HandoutViewerModal from './HandoutViewerModal.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const DEFAULT_FOLDERS = ['Locations', 'NPCs', 'Clues', 'Session Logs', 'Uncategorized'];

  let entries = $state<JournalEntry[]>([]);
  let selectedFolder = $state<string>('All');
  let searchQuery = $state<string>('');
  let activeEntry = $state<JournalEntry | null>(null);
  let viewingModalEntry = $state<JournalEntry | null>(null);

  let editTitle = $state<string>('');
  let editFolder = $state<string>('Uncategorized');
  let editPlayerContent = $state<string>('');
  let editGmNotes = $state<string>('');
  let editTags = $state<string>('');
  let imagePreviewUrl = $state<string | null>(null);

  $effect(() => {
    if (isOpen) {
      loadEntries();
    }
  });

  async function loadEntries() {
    entries = await journalDb.journals.toArray();
    if (entries.length > 0 && !activeEntry) {
      selectEntry(entries[0]);
    }
  }

  function selectEntry(entry: JournalEntry) {
    activeEntry = entry;
    editTitle = entry.title;
    editFolder = entry.folder || 'Uncategorized';
    editPlayerContent = entry.playerContent;
    editGmNotes = entry.gmNotes;
    editTags = entry.tags.join(', ');

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      imagePreviewUrl = null;
    }
    if (entry.imageBlob) {
      imagePreviewUrl = URL.createObjectURL(entry.imageBlob);
    }
  }

  async function handleCreateNew() {
    const newEntry: JournalEntry = {
      id: 'journal_' + Math.random().toString(36).slice(2, 9),
      title: 'New Note',
      folder: selectedFolder === 'All' ? 'Uncategorized' : selectedFolder,
      tags: [],
      gmNotes: '',
      playerContent: '',
      isSharedWithPlayers: false,
      isSharedOnProjector: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await journalDb.journals.add(newEntry);
    entries = [...entries, newEntry];
    selectEntry(newEntry);
  }

  async function handleSaveActive() {
    if (!activeEntry) return;
    const tagsArray = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const updated: Partial<JournalEntry> = {
      title: editTitle.trim() || 'Untitled Note',
      folder: editFolder,
      playerContent: editPlayerContent,
      gmNotes: editGmNotes,
      tags: tagsArray,
      updatedAt: Date.now(),
    };

    await journalDb.journals.update(activeEntry.id, updated);
    Object.assign(activeEntry, updated);
    entries = entries.map((e) => (e.id === activeEntry!.id ? activeEntry! : e));
  }

  async function handleDeleteActive() {
    if (!activeEntry) return;
    await journalDb.journals.delete(activeEntry.id);
    entries = entries.filter((e) => e.id !== activeEntry!.id);
    activeEntry = entries.length > 0 ? entries[0] : null;
    if (activeEntry) {
      selectEntry(activeEntry);
    }
  }

  async function handleImageDrop(e: DragEvent) {
    e.preventDefault();
    if (!activeEntry || !e.dataTransfer?.files?.length) return;
    const file = e.dataTransfer.files[0];
    if (!file.type.startsWith('image/')) return;

    await saveImageBlob(file);
  }

  async function handleImageFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!activeEntry || !input.files?.length) return;
    const file = input.files[0];
    await saveImageBlob(file);
  }

  async function saveImageBlob(file: File) {
    if (!activeEntry) return;
    activeEntry.imageBlob = file;
    activeEntry.imageMime = file.type;
    activeEntry.updatedAt = Date.now();

    await journalDb.journals.update(activeEntry.id, {
      imageBlob: file,
      imageMime: file.type,
      updatedAt: Date.now(),
    });

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    imagePreviewUrl = URL.createObjectURL(file);
  }

  async function handleRemoveImage() {
    if (!activeEntry) return;
    activeEntry.imageBlob = undefined;
    activeEntry.imageMime = undefined;
    await journalDb.journals.update(activeEntry.id, {
      imageBlob: undefined,
      imageMime: undefined,
      updatedAt: Date.now(),
    });
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      imagePreviewUrl = null;
    }
  }

  let filteredEntries = $derived(
    entries.filter((entry) => {
      const matchFolder =
        selectedFolder === 'All' || (entry.folder || 'Uncategorized') === selectedFolder;
      const matchQuery =
        searchQuery === '' ||
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchFolder && matchQuery;
    })
  );
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex justify-end transition-opacity"
    onclick={onClose}
  >
    <div
      class="w-full max-w-5xl h-full bg-slate-900 border-l border-slate-700 text-slate-100 flex shadow-2xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Sidebar / Folder Hierarchy & Notes List -->
      <div class="w-72 bg-slate-950/80 border-r border-slate-800 flex flex-col shrink-0">
        <!-- Drawer Header -->
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 class="font-bold text-amber-400 flex items-center gap-2">
            <span>📚</span>
            <span>CAMPAIGN JOURNAL</span>
          </h2>
          <button
            onclick={onClose}
            class="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
            aria-label="Close Journal"
          >
            ✕
          </button>
        </div>

        <!-- Search Bar -->
        <div class="p-3 border-b border-slate-800">
          <input
            type="text"
            placeholder="Search notes or tags..."
            bind:value={searchQuery}
            class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
          />
        </div>

        <!-- Folder Filter Tabs -->
        <div class="flex flex-wrap gap-1 p-2 border-b border-slate-800 text-[11px]">
          <button
            class="px-2 py-0.5 rounded transition-colors {selectedFolder === 'All'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}"
            onclick={() => (selectedFolder = 'All')}
          >
            All
          </button>
          {#each DEFAULT_FOLDERS as folder}
            <button
              class="px-2 py-0.5 rounded transition-colors {selectedFolder === folder
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}"
              onclick={() => (selectedFolder = folder)}
            >
              {folder}
            </button>
          {/each}
        </div>

        <!-- Entries List -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          {#each filteredEntries as entry (entry.id)}
            <button
              class="w-full text-left p-2 rounded transition-colors text-xs flex flex-col gap-0.5 {activeEntry?.id ===
              entry.id
                ? 'bg-slate-800 text-amber-300 border border-slate-700'
                : 'hover:bg-slate-900 text-slate-300'}"
              onclick={() => selectEntry(entry)}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold truncate">{entry.title}</span>
                {#if entry.imageBlob}
                  <span class="text-[10px]" title="Contains Image">🖼️</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 text-[10px] text-slate-500">
                <span>{entry.folder || 'Uncategorized'}</span>
                {#if entry.isSharedWithPlayers}
                  <span class="text-emerald-400 font-bold">● Shared</span>
                {/if}
              </div>
            </button>
          {:else}
            <div class="text-center py-8 text-xs text-slate-500">No notes found.</div>
          {/each}
        </div>

        <!-- Add Note Button -->
        <div class="p-3 border-t border-slate-800">
          <button
            onclick={handleCreateNew}
            class="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <span>+</span>
            <span>New Note</span>
          </button>
        </div>
      </div>

      <!-- Editor Panel -->
      <div class="flex-1 flex flex-col bg-slate-900 overflow-hidden">
        {#if activeEntry}
          <!-- Editor Sub-Header -->
          <div class="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div class="flex-1 flex items-center gap-3">
              <input
                type="text"
                bind:value={editTitle}
                onblur={handleSaveActive}
                class="text-lg font-bold bg-transparent border-b border-transparent hover:border-slate-700 focus:border-amber-500 px-1 py-0.5 text-slate-100 focus:outline-hidden"
              />
              <select
                bind:value={editFolder}
                onchange={handleSaveActive}
                class="bg-slate-800 border border-slate-700 rounded text-xs px-2 py-1 text-slate-300 focus:outline-hidden"
              >
                {#each DEFAULT_FOLDERS as folder}
                  <option value={folder}>{folder}</option>
                {/each}
              </select>
            </div>

            <div class="flex items-center gap-2">
              <button
                onclick={() => (viewingModalEntry = activeEntry)}
                class="px-3 py-1.5 rounded bg-amber-700/80 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Present Handout"
              >
                <span>📜</span>
                <span>Present</span>
              </button>
              <button
                onclick={handleDeleteActive}
                class="px-2.5 py-1.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs transition-colors"
                title="Delete Note"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- Tags input -->
          <div class="px-4 py-2 border-b border-slate-800 flex items-center gap-2 text-xs">
            <span class="text-slate-500">Tags:</span>
            <input
              type="text"
              placeholder="e.g. quest, tavern, clue (comma separated)"
              bind:value={editTags}
              onblur={handleSaveActive}
              class="flex-1 bg-transparent border-none text-slate-300 placeholder-slate-600 focus:outline-hidden text-xs"
            />
          </div>

          <!-- Dual Markdown Editors & Image Dropzone -->
          <div class="flex-1 grid grid-cols-2 gap-px bg-slate-800 overflow-hidden">
            <!-- Left Pane: Public Player Lore -->
            <div class="flex flex-col bg-slate-900 p-4 overflow-hidden">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <span>📖</span>
                  <span>Public Player Lore</span>
                </span>
                <span class="text-[10px] text-slate-500">Shared with /play and Projector</span>
              </div>
              <textarea
                bind:value={editPlayerContent}
                onblur={handleSaveActive}
                placeholder="Write narrative details or description visible to players..."
                class="flex-1 w-full bg-slate-950/60 border border-slate-800 rounded p-3 text-xs font-mono text-slate-200 resize-none focus:outline-hidden focus:border-emerald-500 leading-relaxed"
              ></textarea>
            </div>

            <!-- Right Pane: Secret DM Notes -->
            <div class="flex flex-col bg-slate-900 p-4 overflow-hidden">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                  <span>🔒</span>
                  <span>Secret DM Notes</span>
                </span>
                <span class="text-[10px] text-slate-500">Visible strictly to Dungeon Master</span>
              </div>
              <textarea
                bind:value={editGmNotes}
                onblur={handleSaveActive}
                placeholder="Write secret DCs, plot twists, monster stats, or GM reminders..."
                class="flex-1 w-full bg-slate-950/60 border border-slate-800 rounded p-3 text-xs font-mono text-amber-200/90 resize-none focus:outline-hidden focus:border-amber-500 leading-relaxed"
              ></textarea>
            </div>
          </div>

          <!-- Image Attachment Dropzone Bar -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="h-28 border-t border-slate-800 bg-slate-950/70 p-3 flex items-center gap-4"
            ondragover={(e) => e.preventDefault()}
            ondrop={handleImageDrop}
          >
            {#if imagePreviewUrl}
              <div class="relative h-full aspect-video rounded border border-slate-700 overflow-hidden group shrink-0">
                <img src={imagePreviewUrl} alt="Handout Artwork" class="w-full h-full object-cover" />
                <button
                  onclick={handleRemoveImage}
                  class="absolute top-1 right-1 bg-black/80 hover:bg-rose-900 text-white rounded px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕ Remove
                </button>
              </div>
            {/if}

            <label
              class="flex-1 h-full border-2 border-dashed border-slate-700 hover:border-amber-500/80 rounded flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-slate-200 transition-colors p-2 text-center"
            >
              <span class="text-lg">🖼️</span>
              <span class="text-xs font-medium">Drag & drop image attachment or click to browse</span>
              <span class="text-[10px] text-slate-500">Supports PNG, JPEG, WEBP</span>
              <input type="file" accept="image/*" class="hidden" onchange={handleImageFileInput} />
            </label>
          </div>
        {:else}
          <div class="flex-1 flex flex-col items-center justify-center text-slate-500">
            <span class="text-3xl mb-2">📜</span>
            <p class="text-sm">Select or create a journal note to start writing.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if viewingModalEntry}
  <HandoutViewerModal
    entry={viewingModalEntry}
    onClose={() => (viewingModalEntry = null)}
  />
{/if}
