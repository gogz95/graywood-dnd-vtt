<script lang="ts">
  // CompendiumBrowser.svelte — SRD compendium with import, search, tag filtering, and "Add to Encounter"

  interface CompendiumEntry {
    id: string;
    name: string;
    type: 'creature' | 'spell' | 'item';
    // Creature fields
    cr?: number;
    ac?: number;
    hp?: number;
    size?: string;
    creature_type?: string;
    // Spell fields
    level?: number;
    school?: string;
    casting_time?: string;
    range?: string;
    components?: string;
    duration?: string;
    // Item fields
    rarity?: string;
    requires_attunement?: boolean;
    // Shared
    description: string;
    source: 'api' | 'imported';
  }

  const STORAGE_KEY = 'vtt_compendium_imports';

  type FilterType = 'all' | 'creature' | 'spell' | 'item';

  let searchQuery    = $state('');
  let filterType     = $state<FilterType>('all');
  let showImportModal = $state(false);
  let importFeedback = $state<string | null>(null);
  let detailEntry    = $state<CompendiumEntry | null>(null);
  let onAddToEncounter: ((e: CompendiumEntry) => void) | undefined = undefined;

  // ── Built-in SRD seed data ─────────────────────────────────────────────────
  const SRD_ENTRIES: CompendiumEntry[] = [
    { id: 'srd-goblin', name: 'Goblin', type: 'creature', cr: 0.25, ac: 15, hp: 7, size: 'Small', creature_type: 'humanoid', description: 'AC 15 (leather armor, shield), HP 7 (2d6), Speed 30 ft. STR 8, DEX 14, CON 10, INT 10, WIS 8, CHA 8. Nimble Escape: bonus action to Disengage or Hide.', source: 'api' },
    { id: 'srd-orc', name: 'Orc', type: 'creature', cr: 0.5, ac: 13, hp: 15, size: 'Medium', creature_type: 'humanoid', description: 'AC 13 (hide armor), HP 15 (2d8+6), Speed 30 ft. STR 16, DEX 12, CON 16, INT 7, WIS 11, CHA 10. Aggressive: bonus action to move up to speed toward a hostile.', source: 'api' },
    { id: 'srd-ogre', name: 'Ogre', type: 'creature', cr: 2, ac: 11, hp: 59, size: 'Large', creature_type: 'giant', description: 'AC 11 (hide armor), HP 59 (7d10+21), Speed 40 ft. STR 19, DEX 8, CON 16. Greatclub: +6 to hit, 13 (2d8+4) bludgeoning.', source: 'api' },
    { id: 'srd-zombie', name: 'Zombie', type: 'creature', cr: 0.25, ac: 8, hp: 22, size: 'Medium', creature_type: 'undead', description: 'AC 8, HP 22 (3d8+9), Speed 20 ft. Undead Fortitude: when dropped to 0 HP by damage (not radiant or critical), make a Con save (DC = 5 + damage) to drop to 1 HP instead.', source: 'api' },
    { id: 'srd-skeleton', name: 'Skeleton', type: 'creature', cr: 0.25, ac: 13, hp: 13, size: 'Medium', creature_type: 'undead', description: 'AC 13 (armor scraps), HP 13 (2d8+4), Speed 30 ft. Vulnerable to bludgeoning. Immune to poison, exhaustion, and the poisoned condition.', source: 'api' },
    { id: 'srd-fireball', name: 'Fireball', type: 'spell', level: 3, school: 'Evocation', casting_time: '1 action', range: '150 ft', components: 'V, S, M (bat guano)', duration: 'Instantaneous', description: '8d6 fire damage in a 20-foot radius sphere. Dex save DC (spellcasting DC) for half. Ignites flammable objects not worn or carried.', source: 'api' },
    { id: 'srd-cure-wounds', name: 'Cure Wounds', type: 'spell', level: 1, school: 'Abjuration', casting_time: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', description: 'Restore 1d8 + spellcasting ability modifier HP to a creature you touch. No effect on undead or constructs. Upcast: +1d8 per slot level above 1st.', source: 'api' },
    { id: 'srd-shield', name: 'Shield', type: 'spell', level: 1, school: 'Abjuration', casting_time: '1 reaction', range: 'Self', components: 'V, S', duration: '1 round', description: '+5 bonus to AC until start of your next turn, including against triggering attack. Immune to Magic Missile.', source: 'api' },
    { id: 'srd-bag-holding', name: 'Bag of Holding', type: 'item', rarity: 'Uncommon', requires_attunement: false, description: 'Extradimensional space holds up to 500 lb (64 cu ft). Always weighs 15 lb. Retrieving an item requires an action. Placing a bag of holding inside another extradimensional space tears a rift to the Astral Plane.', source: 'api' },
    { id: 'srd-cloak-prot', name: 'Cloak of Protection', type: 'item', rarity: 'Uncommon', requires_attunement: true, description: 'Requires attunement. +1 bonus to AC and saving throws while wearing.', source: 'api' },
  ];

  let importedEntries = $state<CompendiumEntry[]>((() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CompendiumEntry[]; } catch { return []; }
  })());

  $effect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(importedEntries)); });

  let allEntries = $derived<CompendiumEntry[]>([...SRD_ENTRIES, ...importedEntries]);

  let filteredEntries = $derived<CompendiumEntry[]>(
    allEntries.filter(e => {
      const matchType = filterType === 'all' || e.type === filterType;
      const matchSearch = !searchQuery.trim() || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchType && matchSearch;
    })
  );

  // ── Import handlers ────────────────────────────────────────────────────────
  function crLabel(cr?: number): string {
    if (cr === undefined) return '—';
    if (cr === 0.125) return '⅛';
    if (cr === 0.25)  return '¼';
    if (cr === 0.5)   return '½';
    return String(cr);
  }

  function typeColor(type: FilterType | 'creature' | 'spell' | 'item'): string {
    if (type === 'creature') return 'text-rose-300 bg-rose-950/50 border-rose-800/30';
    if (type === 'spell')    return 'text-indigo-300 bg-indigo-950/50 border-indigo-800/30';
    if (type === 'item')     return 'text-amber-300 bg-amber-950/50 border-amber-800/30';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  }

  function rarityColor(r?: string): string {
    if (!r) return 'text-slate-400';
    const m: Record<string, string> = { Common:'text-slate-400', Uncommon:'text-emerald-400', Rare:'text-blue-400', 'Very Rare':'text-purple-400', Legendary:'text-amber-400' };
    return m[r] ?? 'text-slate-400';
  }

  async function importFile(file: File) {
    importFeedback = null;
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text) as unknown;
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const entries: CompendiumEntry[] = (arr as Record<string, unknown>[]).map((e, i) => ({
          id: `import-${Date.now()}-${i}`,
          name: String(e.name ?? `Imported ${i + 1}`),
          type: ['creature','spell','item'].includes(String(e.type)) ? String(e.type) as CompendiumEntry['type'] : 'creature',
          description: String(e.description ?? e.desc ?? ''),
          cr: typeof e.cr === 'number' ? e.cr : typeof e.challenge_rating === 'number' ? e.challenge_rating : undefined,
          ac: typeof e.ac === 'number' ? e.ac : undefined,
          hp: typeof e.hp === 'number' ? e.hp : typeof e.hit_points === 'number' ? e.hit_points : undefined,
          size: typeof e.size === 'string' ? e.size : undefined,
          creature_type: typeof e.creature_type === 'string' ? e.creature_type : typeof e.type_detail === 'string' ? e.type_detail : undefined,
          level: typeof e.level === 'number' ? e.level : undefined,
          school: typeof e.school === 'string' ? e.school : undefined,
          casting_time: typeof e.casting_time === 'string' ? e.casting_time : undefined,
          range: typeof e.range === 'string' ? e.range : undefined,
          components: typeof e.components === 'string' ? e.components : undefined,
          duration: typeof e.duration === 'string' ? e.duration : undefined,
          rarity: typeof e.rarity === 'string' ? e.rarity : undefined,
          requires_attunement: Boolean(e.requires_attunement),
          source: 'imported',
        }));
        importedEntries = [...importedEntries, ...entries];
        importFeedback = `Imported ${entries.length} entries from ${file.name}`;
      } else {
        // CSV or plain text: each line = one entry name
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 100);
        const entries: CompendiumEntry[] = lines.map((name, i) => ({
          id: `import-txt-${Date.now()}-${i}`,
          name, type: 'creature', description: `Imported from ${file.name}. No additional data available.`, source: 'imported',
        }));
        importedEntries = [...importedEntries, ...entries];
        importFeedback = `Imported ${entries.length} entries from ${file.name}`;
      }
    } catch {
      importFeedback = `Error parsing ${file.name}. Ensure it is valid JSON or plain text.`;
    }
  }

  function deleteImport(id: string) {
    importedEntries = importedEntries.filter(e => e.id !== id);
  }

  function addToEncounter(entry: CompendiumEntry) {
    onAddToEncounter?.(entry);
    // Dispatch a custom DOM event as fallback so parent layout can catch it
    window.dispatchEvent(new CustomEvent('vtt:add-to-encounter', { detail: entry }));
  }
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">

  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900 shrink-0">
    <div>
      <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wide">5e SRD Compendium</h2>
      <p class="text-[10px] text-slate-500">{allEntries.length} entries · {importedEntries.length} imported</p>
    </div>
    <button onclick={() => showImportModal = true} class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-colors shadow">⬆ Import</button>
  </div>

  <!-- Search + Filter bar -->
  <div class="flex gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/50 shrink-0">
    <input
      type="search"
      bind:value={searchQuery}
      placeholder="Search name or description…"
      class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
    />
    <div class="flex gap-1">
      {#each (['all','creature','spell','item'] as FilterType[]) as ft}
        <button
          onclick={() => filterType = ft}
          class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors {filterType === ft ? typeColor(ft) + ' border' : 'text-slate-500 hover:text-slate-300 border border-transparent'}"
        >{ft}</button>
      {/each}
    </div>
  </div>

  <!-- Results count -->
  <div class="px-4 py-1.5 text-[10px] text-slate-600 border-b border-slate-800/40 shrink-0">
    {filteredEntries.length} result{filteredEntries.length !== 1 ? 's' : ''}
  </div>

  <!-- Entry List -->
  <div class="flex-1 overflow-y-auto">
    {#if filteredEntries.length === 0}
      <div class="text-center py-16 text-slate-600 text-xs">No entries match "{searchQuery}"</div>
    {/if}
    {#each filteredEntries as entry (entry.id)}
      <div class="border-b border-slate-800/60 hover:bg-slate-900/60 transition-colors">
        <div
          role="button"
          tabindex="0"
          class="flex items-start gap-3 px-4 py-3 cursor-pointer w-full text-left"
          onclick={() => detailEntry = detailEntry?.id === entry.id ? null : entry}
          onkeydown={(e) => { if (e.key === 'Enter') detailEntry = detailEntry?.id === entry.id ? null : entry; }}
        >
          <!-- Type badge -->
          <span class="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border {typeColor(entry.type)}">{entry.type}</span>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-bold text-slate-200">{entry.name}</span>
              {#if entry.type === 'creature' && entry.cr !== undefined}
                <span class="text-[10px] font-mono text-slate-500">CR {crLabel(entry.cr)}</span>
                {#if entry.ac !== undefined}<span class="text-[10px] font-mono text-slate-600">AC {entry.ac}</span>{/if}
                {#if entry.hp !== undefined}<span class="text-[10px] font-mono text-slate-600">HP {entry.hp}</span>{/if}
              {/if}
              {#if entry.type === 'spell' && entry.level !== undefined}
                <span class="text-[10px] font-mono text-slate-500">Lvl {entry.level} {entry.school}</span>
              {/if}
              {#if entry.type === 'item' && entry.rarity}
                <span class="text-[10px] font-semibold {rarityColor(entry.rarity)}">{entry.rarity}</span>
                {#if entry.requires_attunement}<span class="text-[9px] text-slate-600">(Attunement)</span>{/if}
              {/if}
              {#if entry.source === 'imported'}
                <span class="text-[9px] text-indigo-500">imported</span>
              {/if}
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{entry.description}</p>
          </div>

          <!-- Quick actions -->
          <div class="flex gap-1 shrink-0 ml-1">
            <button
              onclick={(e) => { e.stopPropagation(); addToEncounter(entry); }}
              class="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 text-[10px] font-bold rounded border border-rose-800/30 transition-colors whitespace-nowrap"
              title="Add to Encounter"
            >+ Enc</button>
            {#if entry.source === 'imported'}
              <button
                onclick={(e) => { e.stopPropagation(); deleteImport(entry.id); }}
                class="p-1 text-slate-600 hover:text-rose-400 text-xs transition-colors"
                title="Delete import"
              >✕</button>
            {/if}
          </div>
        </div>

        <!-- Expanded Detail -->
        {#if detailEntry?.id === entry.id}
          <div class="px-4 pb-4 pt-0 bg-slate-900/40">
            <p class="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.description}</p>
            {#if entry.type === 'spell'}
              <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {#if entry.casting_time}<div><span class="text-slate-500">Cast Time:</span> <span class="text-slate-300">{entry.casting_time}</span></div>{/if}
                {#if entry.range}<div><span class="text-slate-500">Range:</span> <span class="text-slate-300">{entry.range}</span></div>{/if}
                {#if entry.components}<div><span class="text-slate-500">Components:</span> <span class="text-slate-300">{entry.components}</span></div>{/if}
                {#if entry.duration}<div><span class="text-slate-500">Duration:</span> <span class="text-slate-300">{entry.duration}</span></div>{/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- Import Modal -->
{#if showImportModal}
  <div role="presentation" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showImportModal = false; }}>
    <div class="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
      <h3 class="text-base font-bold text-slate-100">Import Compendium Data</h3>
      <p class="text-xs text-slate-400">Accepts SRD JSON arrays, single stat-block JSON objects, or plain text files (one name per line). JSON fields: <code class="text-indigo-300">name, type, description, cr, ac, hp, level, school, rarity, requires_attunement</code>.</p>

      <label class="block w-full py-10 border-2 border-dashed border-slate-700 rounded-xl text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-950/10 transition-colors">
        <span class="text-3xl block mb-2">📂</span>
        <span class="text-xs font-semibold text-slate-400">Click to select JSON, CSV, or TXT file</span>
        <input type="file" accept=".json,.csv,.txt" class="hidden"
          onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importFile(f); }} />
      </label>

      {#if importFeedback}
        <div class="p-3 {importFeedback.startsWith('Error') ? 'bg-rose-950/50 border-rose-800/40 text-rose-300' : 'bg-emerald-950/50 border-emerald-800/40 text-emerald-300'} border rounded-lg text-xs font-semibold">
          {importFeedback}
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button onclick={() => { showImportModal = false; importFeedback = null; }} class="px-5 py-2.5 bg-slate-800 text-slate-300 text-sm rounded-xl hover:bg-slate-700 transition-colors">Close</button>
      </div>
    </div>
  </div>
{/if}
