<script lang="ts">
  // HandoutStudioView.svelte — Markdown-to-Parchment Handout Studio & Broadcast Suite
  // Live split-screen Markdown editor, preset templates, local campaign persistence, and WebSocket broadcasting.

  import { onMount } from 'svelte';
  import ParchmentViewer from './ParchmentViewer.svelte';
  import {
    broadcastHandoutToParty,
    dismissHandoutFromParty,
    type HandoutDocument,
    type HandoutTheme,
    type WaxSealType,
  } from '../../network/broadcastBridge';
  import { isWsConnectedStore } from '../../../stores/websocketStore';
  import {
    generateProceduralContract,
    generateLocalizedHubContract,
    type ContractClassification,
    type SettlementHub
  } from '../../data/handoutTables';

  const STORAGE_HANDOUTS_KEY = 'vtt_campaign_handouts';

  // ── Preset Templates ───────────────────────────────────────────────────────
  const PRESETS: Record<string, Omit<HandoutDocument, 'id' | 'createdAt' | 'updatedAt'>> = {
    bounty: {
      title: 'WANTED: GORGON BLOODHOOK',
      subtitle: 'CHIEFTAIN OF THE CRAGSTONE CORSAIRS',
      theme: 'bounty',
      sealType: 'wax_red',
      sealText: 'MARSHAL OF THE MARCHES',
      contentMarkdown: `[!DEAD_OR_ALIVE]

The High Justiciar of the Provincial Marches hereby declares a public condemnation upon the rogue privateer known as **Gorgon Bloodhook**.

Accused of high piracy along the coastal trade reaches, arson of municipal drydocks, and the unlawful seizure of royal salt convoys.

[!REWARD: 750 GOLD SOVEREIGNS]

### Identifying Marks & Attributes
- Stands six cubits high, wearing blackened sea-drake scales.
- Severed left ear replaced with a barbed brass hoop.
- Accompanied by three ferocious river drakes.

> Any citizen harboring, provisioning, or concealing said outlaw shall face immediate seizure of goods and trial for treason.

Given under the authority of the High Citadel.`,
      dmNotes: 'Bloodhook is currently hiding in the sea caves near Sunken Reef. He carries a potion of water breathing and 120 GP in foreign sun disks.',
    },
    proclamation: {
      title: 'IMPERIAL DECREE OF CURFEW',
      subtitle: 'BY ORDER OF THE PROVINCIAL GOVERNOR',
      theme: 'proclamation',
      sealType: 'wax_gold',
      sealText: 'SOLAR ARCHIVE AUTHORITY',
      contentMarkdown: `To all burghers, guildmasters, and freeholders of the district:

Notice is hereby promulgated that following the recent anomalous disturbances near the frontier reaches, the following strict regulations are enacted immediately:

1. **Sundown Curfew:** All taverns, guildhalls, and market stalls shall shutter their lanterns no later than the second ringing of the watch bell.
2. **Weapons Proscription:** Foreign sellswords and unlicensed adventurers must surrender heavy armaments and siege staves at the outer gatehouse upon entry.
3. **Quarantine Measures:** Any livestock exhibiting unnatural luminescence or planar blight must be presented forthwith to the temple apothecaries.

[!SIGNATURE: Governor Marcus Vance]
[!SIGNATURE: Captain Thorne, Watch Commander]`,
      dmNotes: 'The curfew was enacted because doppelgangers have infiltrated the merchant guild. City guards are suspicious of any adventurers out past 9 PM.',
    },
    journal: {
      title: 'Expedition Journal: Page 42',
      subtitle: '14th Day of the Harvest Moon',
      theme: 'journal',
      sealType: 'none',
      sealText: '',
      contentMarkdown: `The air in these lower fissures smells of sulfur and crushed mandrake.

We reached the subterranean canal three hours after midday. The stone carvings here predate the First Marquisate—geometric runes that seem to subtly shift when viewed in torchlight.

Vance found the skeleton of a surveyor wedged beneath a fallen lintel. In his belt pouch was a brass cylinder containing this map fragment:

| Landmark | Distance | Hazard |
|---|---|---|
| Sunken Obelisk | 2 leagues north | Brown Mold colonies |
| Chasm Bridge | 4 leagues west | Piercer nests |
| Vault Door | Deep abyss | Sealed with solar runes |

*If anyone finds this journal, do not touch the obsidian mirror in the crypt. It reflects things that are not standing in the room.*`,
      dmNotes: 'The obsidian mirror acts as a scrying conduit for an aboleth in the Underdark.',
    },
    contract: {
      title: 'MERCANTILE ESCORT INDENTURE',
      subtitle: 'REGISTERED AT THE OAKHAVEN TRADE EXCHANGE',
      theme: 'contract',
      sealType: 'imperial_black',
      sealText: 'OAKHAVEN GUILD OF CARTERS',
      contentMarkdown: `This indenture of service is made between **The Silver Hand Mercenaries** (*Party of the First Part*) and **Master Orin Vance of Vance & Sons Freight** (*Party of the Second Part*).

:::columns
### Article I: Scope of Escort
The First Party covenants to furnish four competent armed escorts for the duration of the overland transit from Oakhaven Depot to High Sun Sanctuary, guaranteeing safe passage of six heavy wagons laden with iron billets.

### Article II: Hazard Indemnity
In the event of ambuscades by highwaymen, goblins, or wandering monstrosities, the First Party retains full discretion over tactical retreats. The Second Party covenants to pay a hazard bonus of **50 GP** per fallen guard beast.
:::

---

### Consideration & Payment Terms
- Retainer of **150 GP** payable upon departure from the depot.
- Remaining balance of **350 GP** payable upon delivery of cargo with seals intact.

[!SIGNATURE: Commander Valen, First Party]
[!SIGNATURE: Master Orin Vance, Second Party]`,
      dmNotes: 'Orin Vance is secretly transporting smuggled void glass shards hidden beneath the iron ingots.',
    },
  };

  // ── Saved Handouts State ───────────────────────────────────────────────────
  let savedHandouts = $state<HandoutDocument[]>([]);
  let activeHandoutId = $state<string>('');
  let previewScale = $state<number>(100);

  // Active document editing fields
  let docTitle = $state('Official Document');
  let docSubtitle = $state('');
  let docTheme = $state<HandoutTheme>('classic');
  let docSealType = $state<WaxSealType>('wax_red');
  let docSealText = $state('SEALED & WITNESSED');
  let docContent = $state('');
  let docDmNotes = $state('');

  // Broadcast feedback
  let broadcastStatus = $state<{ type: 'success' | 'info'; text: string } | null>(null);
  let isCurrentlyBroadcast = $state<boolean>(false);

  const activeHandout = $derived<HandoutDocument>({
    id: activeHandoutId || 'draft-handout',
    title: docTitle,
    subtitle: docSubtitle,
    theme: docTheme,
    sealType: docSealType,
    sealText: docSealText,
    contentMarkdown: docContent,
    dmNotes: docDmNotes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  onMount(() => {
    loadHandoutsFromStorage();
  });

  function loadHandoutsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_HANDOUTS_KEY);
      if (raw) {
        savedHandouts = JSON.parse(raw);
      }
    } catch { /* storage safe */ }

    if (savedHandouts.length === 0) {
      // Seed with built-in presets
      const seeded: HandoutDocument[] = Object.entries(PRESETS).map(([key, p], i) => ({
        ...p,
        id: `preset-${key}-${Date.now() + i}`,
        createdAt: Date.now() - (4 - i) * 86400000,
        updatedAt: Date.now(),
      }));
      savedHandouts = seeded;
      saveHandoutsToStorage();
    }

    if (savedHandouts.length > 0) {
      loadHandout(savedHandouts[0]);
    }
  }

  function saveHandoutsToStorage() {
    try {
      localStorage.setItem(STORAGE_HANDOUTS_KEY, JSON.stringify(savedHandouts));
    } catch { /* storage safe */ }
  }

  function loadHandout(doc: HandoutDocument) {
    activeHandoutId = doc.id;
    docTitle = doc.title;
    docSubtitle = doc.subtitle || '';
    docTheme = doc.theme;
    docSealType = doc.sealType;
    docSealText = doc.sealText || '';
    docContent = doc.contentMarkdown;
    docDmNotes = doc.dmNotes || '';
  }

  function applyPreset(presetKey: string) {
    const p = PRESETS[presetKey];
    if (!p) return;
    docTitle = p.title;
    docSubtitle = p.subtitle || '';
    docTheme = p.theme;
    docSealType = p.sealType;
    docSealText = p.sealText || '';
    docContent = p.contentMarkdown;
    docDmNotes = p.dmNotes || '';
  }

  function handleSaveCurrent() {
    const existingIndex = savedHandouts.findIndex(h => h.id === activeHandoutId);
    const updatedDoc: HandoutDocument = {
      ...activeHandout,
      id: activeHandoutId || `handout-${Date.now()}`,
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      savedHandouts[existingIndex] = updatedDoc;
    } else {
      savedHandouts = [...savedHandouts, updatedDoc];
      activeHandoutId = updatedDoc.id;
    }

    saveHandoutsToStorage();
    broadcastStatus = { type: 'success', text: `Saved "${updatedDoc.title}" to Campaign Bundle.` };
    setTimeout(() => { broadcastStatus = null; }, 3000);
  }

  function handleCreateNew() {
    const newId = `handout-${Date.now()}`;
    const newDoc: HandoutDocument = {
      id: newId,
      title: 'New Parchment Handout',
      subtitle: 'Provincial Notice',
      theme: 'classic',
      sealType: 'wax_red',
      sealText: 'OFFICIAL DOCUMENT',
      contentMarkdown: `# Official Notice\n\nBegin typing your proclamation, bounty, or journal notes here…\n\n- Add bulleted stipulations\n- Insert signature lines\n- Add tables or quotes`,
      dmNotes: 'Secret notes visible only to the DM.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    savedHandouts = [newDoc, ...savedHandouts];
    loadHandout(newDoc);
    saveHandoutsToStorage();
  }

  function handleDeleteCurrent() {
    if (!activeHandoutId) return;
    if (confirm(`Delete handout "${docTitle}"?`)) {
      savedHandouts = savedHandouts.filter(h => h.id !== activeHandoutId);
      saveHandoutsToStorage();
      if (savedHandouts.length > 0) {
        loadHandout(savedHandouts[0]);
      } else {
        handleCreateNew();
      }
    }
  }

  // ── Broadcast to Player Clients ────────────────────────────────────────────
  function handleBroadcastToParty() {
    broadcastHandoutToParty(activeHandout);
    isCurrentlyBroadcast = true;
    broadcastStatus = {
      type: 'success',
      text: `Broadcast "${activeHandout.title}" to all connected player devices!`,
    };
  }

  function handleDismissBroadcast() {
    dismissHandoutFromParty(activeHandout.id);
    isCurrentlyBroadcast = false;
    broadcastStatus = {
      type: 'info',
      text: `Dismissed handout overlay from player devices.`,
    };
    setTimeout(() => { broadcastStatus = null; }, 3000);
  }

  // ── Quick Toolbar Inserts ──────────────────────────────────────────────────
  function insertSnippet(snippet: string) {
    docContent = docContent + '\n' + snippet;
  }

  let selectedHubPreset = $state<'Capital City' | 'Frontier Town' | 'Coastal Village' | 'Custom'>('Capital City');
  let customHubName = $state<string>('');
  let activeHub = $derived(selectedHubPreset === 'Custom' ? (customHubName.trim() || 'Frontier Outpost') : selectedHubPreset);

  function handleGenerateLocalizedContract() {
    const contract = generateLocalizedHubContract(activeHub);
    docTitle = contract.title;
    docSubtitle = `${contract.commissioner} (${contract.originSettlement})`;
    docTheme = 'contract';
    docSealType = 'imperial_black';
    docSealText = 'CHANCELLERY WITNESSED';
    docContent = contract.markdownContent;
    docDmNotes = contract.dmNotes;
    broadcastStatus = {
      type: 'success',
      text: `Generated ${activeHub} contract (${contract.id}) with escrow in Gold Pieces!`
    };
    setTimeout(() => { broadcastStatus = null; }, 3000);
  }

  function handleGenerateContract(cat?: ContractClassification) {
    const contract = generateProceduralContract(cat, activeHub);
    docTitle = contract.title;
    docSubtitle = `${contract.commissioner} (${contract.originSettlement})`;
    docTheme = 'contract';
    docSealType = 'imperial_black';
    docSealText = 'CHANCELLERY WITNESSED';
    docContent = contract.markdownContent;
    docDmNotes = contract.dmNotes;
    broadcastStatus = {
      type: 'success',
      text: `Generated official ${contract.classification} contract (${contract.id})!`
    };
    setTimeout(() => { broadcastStatus = null; }, 3000);
  }

  function handlePrintExport() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
  <!-- ── Top Toolbar ──────────────────────────────────────────────────────── -->
  <header class="h-11 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 gap-3">
    <div class="flex items-center gap-2">
      <span class="text-base">📜</span>
      <h1 class="text-xs font-bold uppercase tracking-wider text-slate-200">Parchment Handout Studio &amp; LAN Broadcast</h1>
    </div>

    <!-- Center Broadcast & Generator Action Controls -->
    <div class="flex items-center gap-2">
      <!-- Settlement Hub Dropdown & Custom Text Input -->
      <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs">
        <span class="text-slate-500 font-bold uppercase text-[10px]">Settlement:</span>
        <select
          bind:value={selectedHubPreset}
          class="bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer"
        >
          <option value="Capital City" class="bg-slate-900 text-slate-200">Capital City</option>
          <option value="Frontier Town" class="bg-slate-900 text-slate-200">Frontier Town</option>
          <option value="Coastal Village" class="bg-slate-900 text-slate-200">Coastal Village</option>
          <option value="Custom" class="bg-slate-900 text-slate-200">Custom Name...</option>
        </select>
        {#if selectedHubPreset === 'Custom'}
          <input
            type="text"
            bind:value={customHubName}
            placeholder="Settlement name..."
            class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-32 focus:outline-none focus:border-indigo-500"
          />
        {/if}
      </div>

      <button
        onclick={handleGenerateLocalizedContract}
        class="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5"
        title="Generate localized Adventurers Guild contract from selected settlement hub"
      >
        <span>🎲</span>
        <span>Generate Contract</span>
      </button>

      <button
        onclick={handleBroadcastToParty}
        class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all shadow-md flex items-center gap-1.5 {isCurrentlyBroadcast ? 'ring-2 ring-emerald-400 animate-pulse' : ''}"
        title="Broadcast active parchment to all connected player screens via WebSocket"
      >
        <span>📡</span>
        <span>Broadcast to Party</span>
      </button>

      {#if isCurrentlyBroadcast}
        <button
          onclick={handleDismissBroadcast}
          class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-rose-100 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
          title="Dismiss handout from player screens"
        >
          <span>✕</span>
          <span>Dismiss Broadcast</span>
        </button>
      {/if}

      <button
        onclick={handlePrintExport}
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700"
        title="Print document or Export directly to PDF"
      >
        <span>🖨️</span>
        <span>Print / PDF</span>
      </button>
    </div>

    <!-- Right Controls: Save / New / Zoom -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
        <span class="text-slate-500 text-[10px] uppercase font-bold">Zoom</span>
        <input
          type="range"
          min="70"
          max="125"
          step="5"
          bind:value={previewScale}
          class="w-16 accent-indigo-500 cursor-pointer"
        />
        <span class="font-mono text-[10px] text-slate-300 w-6">{previewScale}%</span>
      </div>

      <button
        onclick={handleSaveCurrent}
        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow"
      >
        💾 Save
      </button>

      <button
        onclick={handleCreateNew}
        class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
      >
        + New
      </button>
    </div>
  </header>

  <!-- Notice Banner -->
  {#if broadcastStatus}
    <div class="px-4 py-1.5 bg-slate-900 border-b border-indigo-500/40 text-xs flex items-center justify-between shrink-0 {broadcastStatus.type === 'success' ? 'text-emerald-300 bg-emerald-950/40' : 'text-slate-300'}">
      <span>{broadcastStatus.text}</span>
      <button onclick={() => broadcastStatus = null} class="text-slate-400 hover:text-slate-200">✕</button>
    </div>
  {/if}

  <!-- ── Main Split View ──────────────────────────────────────────────────── -->
  <div class="flex-1 flex overflow-hidden min-h-0">
    <!-- ── LEFT: Live Editor & Presets Panel ──────────────────────────────── -->
    <div class="w-[450px] border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0 overflow-y-auto">
      <!-- Saved Handouts Selector & Preset Quick Picks -->
      <div class="p-4 border-b border-slate-800 space-y-3">
        <div>
          <label for="handout-select-doc" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Select Document</label>
          <div class="flex items-center gap-2">
            <select
              id="handout-select-doc"
              value={activeHandoutId}
              onchange={(e) => {
                const target = savedHandouts.find(h => h.id === (e.target as HTMLSelectElement).value);
                if (target) loadHandout(target);
              }}
              class="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold truncate"
            >
              {#each savedHandouts as doc}
                <option value={doc.id}>{doc.title} ({doc.theme})</option>
              {/each}
            </select>
            <button
              onclick={handleDeleteCurrent}
              class="p-2 text-slate-500 hover:text-rose-400 text-xs rounded-lg hover:bg-slate-800 transition-colors"
              title="Delete Document"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- Preset Template Quick Picks -->
        <div>
          <span class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Load Preset Template</span>
          <div class="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              onclick={() => applyPreset('bounty')}
              class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-amber-700/60 text-slate-300 rounded-lg font-semibold text-left transition-colors flex items-center gap-1.5"
            >
              <span>☠</span>
              <span>Official Bounty</span>
            </button>
            <button
              onclick={() => applyPreset('proclamation')}
              class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-amber-700/60 text-slate-300 rounded-lg font-semibold text-left transition-colors flex items-center gap-1.5"
            >
              <span>👑</span>
              <span>Royal Decree</span>
            </button>
            <button
              onclick={() => applyPreset('journal')}
              class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-amber-700/60 text-slate-300 rounded-lg font-semibold text-left transition-colors flex items-center gap-1.5"
            >
              <span>📖</span>
              <span>Torn Journal</span>
            </button>
            <button
              onclick={() => applyPreset('contract')}
              class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-amber-700/60 text-slate-300 rounded-lg font-semibold text-left transition-colors flex items-center gap-1.5"
            >
              <span>⚖️</span>
              <span>Trade Contract</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Document Metadata Controls -->
      <div class="p-4 border-b border-slate-800 space-y-3 text-xs">
        <div>
          <label for="handout-doc-title" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Title</label>
          <input
            id="handout-doc-title"
            type="text"
            bind:value={docTitle}
            placeholder="Document title…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-bold focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label for="handout-doc-subtitle" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Subtitle / Origin</label>
          <input
            id="handout-doc-subtitle"
            type="text"
            bind:value={docSubtitle}
            placeholder="e.g. By Order of the High Marshal…"
            class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="handout-doc-theme" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Parchment Theme</label>
            <select
              id="handout-doc-theme"
              bind:value={docTheme}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="classic">Classic Vellum</option>
              <option value="bounty">Bounty Notice</option>
              <option value="proclamation">Royal Proclamation</option>
              <option value="contract">Legal Indenture</option>
              <option value="journal">Traveler Journal</option>
            </select>
          </div>

          <div>
            <label for="handout-doc-seal" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Wax Seal</label>
            <select
              id="handout-doc-seal"
              bind:value={docSealType}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="wax_red">Crimson Wax</option>
              <option value="wax_gold">Solar Gold Wax</option>
              <option value="imperial_black">Imperial Black Wax</option>
              <option value="none">No Seal</option>
            </select>
          </div>
        </div>

        {#if docSealType !== 'none'}
          <div>
            <label for="handout-doc-seal-text" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Seal Inscription</label>
            <input
              id="handout-doc-seal-text"
              type="text"
              bind:value={docSealText}
              placeholder="SEALED &amp; WITNESSED"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 uppercase font-mono text-[11px] focus:outline-none"
            />
          </div>
        {/if}
      </div>

      <!-- Quick Formatting Snippet Bar -->
      <div class="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[10px] scrollbar-thin">
        <span class="text-slate-600 uppercase font-bold shrink-0">Insert:</span>
        <button onclick={() => insertSnippet('### New Section Header')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">### Head</button>
        <button onclick={() => insertSnippet('> Formal decree quote text…')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">&gt; Quote</button>
        <button onclick={() => insertSnippet('[!REWARD: 500 GOLD PIECES]')} class="px-2 py-0.5 bg-amber-950 text-amber-300 rounded font-mono">[!REWARD]</button>
        <button onclick={() => insertSnippet('[!SIGNATURE: Authority Name]')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">[!SIGN]</button>
        <button onclick={() => insertSnippet(':::\nLeft column text\n:::\nRight column text\n:::')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">Columns</button>
        <button onclick={() => insertSnippet('| Item | Cost |\n|---|---|\n| Supplies | 25 GP |')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">Table</button>
        <button onclick={() => insertSnippet('---')} class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono">--- Flourish</button>
      </div>

      <!-- Live Markdown Body Editor -->
      <div class="flex-1 p-4 flex flex-col min-h-[250px]">
        <label for="handout-doc-content" class="text-[10px] uppercase font-bold text-slate-500 block mb-1">Document Markdown Content</label>
        <textarea
          id="handout-doc-content"
          bind:value={docContent}
          placeholder="Type Markdown content here…"
          class="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 resize-none"
        ></textarea>
      </div>

      <!-- Secret DM Notes (Never Broadcast) -->
      <div class="p-4 border-t border-slate-800 bg-amber-950/10">
        <label for="handout-doc-dmnotes" class="text-[10px] uppercase font-bold text-amber-400 block mb-1 flex items-center gap-1">
          <span>🔒</span>
          <span>Secret DM Notes (Never Sent to Players)</span>
        </label>
        <textarea
          id="handout-doc-dmnotes"
          bind:value={docDmNotes}
          rows="3"
          placeholder="Internal notes regarding true culprit, hidden motives, DC 15 Investigation clues…"
          class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-amber-200/90 font-mono focus:outline-none focus:border-amber-600"
        ></textarea>
      </div>
    </div>

    <!-- ── RIGHT: Live Interactive Parchment Preview ──────────────────────── -->
    <main class="flex-1 overflow-y-auto p-8 bg-[#0a0c14] flex flex-col items-center justify-start">
      <div
        class="transition-transform duration-200 origin-top w-full max-w-2xl"
        style="transform: scale({previewScale / 100});"
      >
        <ParchmentViewer
          title={docTitle}
          subtitle={docSubtitle}
          contentMarkdown={docContent}
          theme={docTheme}
          sealType={docSealType}
          sealText={docSealText}
        />
      </div>
    </main>
  </div>
</div>
