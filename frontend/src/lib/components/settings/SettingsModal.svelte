<script lang="ts">
  // SettingsModal.svelte — Master Settings Modal for 5e VTT Workstation
  // Manages: Campaign File Hub (disk saving/loading, auto-save), Ollama/LLM settings, Audio devices & buffer, UI Themes.

  import { onMount } from 'svelte';
  import {
    saveCampaignToFile,
    loadCampaignFromFile,
    executeAutoSave,
    setAutoSaveInterval,
    getLastSavedTimestamp,
    getLastAutosaveTimestamp,
    K_CAMPAIGN_NAME,
    K_PARTY_ROSTER,
    K_ENCOUNTERS,
    K_CALENDAR_CONFIG,
    K_ARCHIVIST_MODEL,
    K_ARCHIVIST_TEMP,
    K_COPILOT_MODEL,
    K_COPILOT_TEMP,
    K_OLLAMA_BASE_URL,
    K_AUTOSAVE_INTERVAL,
  } from '../../utils/campaignPersistence';
  import { audioEngine } from '../../audio/AudioEngine';
  import { uiTheme, type ThemeMode, type DisplayMode } from '../../stores/uiTheme.svelte';
  import KnowledgeBaseModal from '../ai/KnowledgeBaseModal.svelte';
  import LoreIngestionSettingsTab from './LoreIngestionSettingsTab.svelte';
  import HomebrewSettingsTab from './HomebrewSettingsTab.svelte';
  import AutomationSettingsTab from './AutomationSettingsTab.svelte';
  import StorageStatusWidget from '../dm/StorageStatusWidget.svelte';
  import { campaignDirectoryStore } from '../../stores/campaignDirectoryStore.svelte';
  import PluginSettingsTab from './PluginSettingsTab.svelte';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();
  let showKbModal = $state(false);

  type SettingsTab = 'campaign' | 'lore' | 'homebrew' | 'automation' | 'ai' | 'audio' | 'theme' | 'plugins';
  let activeTab = $state<SettingsTab>('campaign');

  // ── Campaign State ─────────────────────────────────────────────────────────
  let campaignName = $state('');
  let partyCount = $state(0);
  let encounterCount = $state(0);
  let lastSavedTime = $state<number | null>(null);
  let lastAutosavedTime = $state<number | null>(null);
  let autoSaveMinutes = $state(5);
  let fileOpStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let isProcessingFile = $state(false);

  // ── AI State ───────────────────────────────────────────────────────────────
  let ollamaBaseUrl = $state('http://127.0.0.1:11434');
  let archivistModel = $state('qwen2.5:7b');
  let archivistTemp = $state(0.0);
  let copilotModel = $state('qwen2.5:7b');
  let copilotTemp = $state(0.6);
  let ollamaStatus = $state<'idle' | 'checking' | 'connected' | 'error'>('idle');
  let ollamaMessage = $state('');

  // ── Audio State ────────────────────────────────────────────────────────────
  let bufferSize = $state(256);
  let availableDevices = $state<MediaDeviceInfo[]>([]);
  let selectedDeviceId = $state('default');
  let masterVol = $state(80);
  let ambienceVol = $state(70);
  let sfxVol = $state(80);

  function refreshState() {
    campaignName = localStorage.getItem(K_CAMPAIGN_NAME) || 'My 5e Campaign';

    try {
      const party = JSON.parse(localStorage.getItem(K_PARTY_ROSTER) || '[]');
      partyCount = Array.isArray(party) ? party.length : 0;
    } catch { partyCount = 0; }

    try {
      const enc = JSON.parse(localStorage.getItem(K_ENCOUNTERS) || '{}');
      encounterCount = Object.keys(enc).length;
    } catch { encounterCount = 0; }

    lastSavedTime = getLastSavedTimestamp();
    lastAutosavedTime = getLastAutosaveTimestamp();
    autoSaveMinutes = Number(localStorage.getItem(K_AUTOSAVE_INTERVAL) || '5');

    ollamaBaseUrl = localStorage.getItem(K_OLLAMA_BASE_URL) || 'http://127.0.0.1:11434';
    archivistModel = localStorage.getItem(K_ARCHIVIST_MODEL) || 'qwen2.5:7b';
    archivistTemp = Number(localStorage.getItem(K_ARCHIVIST_TEMP) || 0.0);
    copilotModel = localStorage.getItem(K_COPILOT_MODEL) || 'qwen2.5:7b';
    copilotTemp = Number(localStorage.getItem(K_COPILOT_TEMP) || 0.6);

    masterVol = Math.round(audioEngine.getMasterVolume() * 100);
    ambienceVol = Math.round(audioEngine.getAmbienceVolume() * 100);
    sfxVol = Math.round(audioEngine.getSfxVolume() * 100);
    bufferSize = audioEngine.getBufferSize();
    selectedDeviceId = audioEngine.getDeviceId();
  }

  onMount(() => {
    refreshState();

    // Query audio output devices if supported
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        availableDevices = devices.filter(d => d.kind === 'audiooutput');
      }).catch(() => {});
    }

    const handleAutoSaveEvt = (e: Event) => {
      const custom = e as CustomEvent<{ timestamp: number }>;
      lastAutosavedTime = custom.detail?.timestamp ?? Date.now();
    };
    window.addEventListener('vtt:autosave-success', handleAutoSaveEvt);
    return () => {
      window.removeEventListener('vtt:autosave-success', handleAutoSaveEvt);
    };
  });

  $effect(() => {
    if (isOpen) {
      refreshState();
    }
  });

  // ── Campaign Handlers ──────────────────────────────────────────────────────
  async function handleExportGvtt() {
    isProcessingFile = true;
    fileOpStatus = null;
    try {
      const res = await campaignDirectoryStore.exportCampaignBundle();
      if (res.success) {
        lastSavedTime = Date.now();
        fileOpStatus = { type: 'success', message: res.message || 'Campaign bundle (.gvtt) exported successfully!' };
      } else {
        fileOpStatus = { type: 'error', message: res.error || 'Failed to export campaign bundle.' };
      }
    } catch (err) {
      fileOpStatus = { type: 'error', message: err instanceof Error ? err.message : 'Export failed.' };
    } finally {
      isProcessingFile = false;
    }
  }

  async function handleImportGvtt(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    input.value = '';

    isProcessingFile = true;
    fileOpStatus = null;

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const archiveBase64 = await base64Promise;

      const res = await campaignDirectoryStore.importCampaignBundle({
        archiveBase64,
        targetCampaignName: file.name.replace(/\.gvtt$/i, ''),
      });

      if (res.success) {
        refreshState();
        fileOpStatus = { type: 'success', message: res.message || `Campaign restored from "${file.name}"!` };
      } else {
        fileOpStatus = { type: 'error', message: res.error || 'Failed to restore campaign bundle.' };
      }
    } catch (err) {
      fileOpStatus = { type: 'error', message: err instanceof Error ? err.message : 'Import failed.' };
    } finally {
      isProcessingFile = false;
    }
  }

  async function handleExport() {
    isProcessingFile = true;
    fileOpStatus = null;
    try {
      const res = await saveCampaignToFile();
      if (res.success) {
        lastSavedTime = Date.now();
        fileOpStatus = { type: 'success', message: `Saved bundle "${res.filename}" successfully!` };
      } else {
        fileOpStatus = { type: 'error', message: 'Save cancelled or rejected.' };
      }
    } catch (err) {
      fileOpStatus = { type: 'error', message: err instanceof Error ? err.message : 'Export failed.' };
    } finally {
      isProcessingFile = false;
    }
  }

  async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    input.value = '';

    isProcessingFile = true;
    fileOpStatus = null;

    try {
      if (file.name.toLowerCase().endsWith('.gvtt')) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const archiveBase64 = await base64Promise;
        const res = await campaignDirectoryStore.importCampaignBundle({
          archiveBase64,
          targetCampaignName: file.name.replace(/\.gvtt$/i, ''),
        });
        if (res.success) {
          refreshState();
          fileOpStatus = { type: 'success', message: res.message || `Campaign restored from "${file.name}"!` };
        } else {
          fileOpStatus = { type: 'error', message: res.error || 'Failed to restore campaign bundle.' };
        }
        return;
      }

      const res = await loadCampaignFromFile(file);
      if (res.success) {
        refreshState();
        fileOpStatus = { type: 'success', message: `Campaign restored from "${file.name}"!` };
      } else {
        fileOpStatus = { type: 'error', message: res.error || 'Failed to restore campaign bundle.' };
      }
    } catch (err) {
      fileOpStatus = { type: 'error', message: err instanceof Error ? err.message : 'Import failed.' };
    } finally {
      isProcessingFile = false;
    }
  }

  function handleAutoSaveChange(minutes: number) {
    autoSaveMinutes = minutes;
    setAutoSaveInterval(minutes);
  }

  function triggerImmediateAutoSave() {
    executeAutoSave();
    lastAutosavedTime = Date.now();
    fileOpStatus = { type: 'success', message: 'Auto-save snapshot created!' };
    setTimeout(() => { fileOpStatus = null; }, 3000);
  }

  // ── AI Handlers ────────────────────────────────────────────────────────────
  async function testOllamaConnection() {
    ollamaStatus = 'checking';
    ollamaMessage = 'Connecting to Ollama…';

    try {
      const res = await fetch(`${ollamaBaseUrl.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        const count = data.models?.length ?? 0;
        ollamaStatus = 'connected';
        ollamaMessage = `Connected! ${count} models installed.`;
      } else {
        ollamaStatus = 'error';
        ollamaMessage = `Ollama responded with HTTP ${res.status}.`;
      }
    } catch {
      ollamaStatus = 'error';
      ollamaMessage = `Could not reach ${ollamaBaseUrl}. Ensure Ollama is running.`;
    }
  }

  function saveAiSettings() {
    localStorage.setItem(K_OLLAMA_BASE_URL, ollamaBaseUrl.trim());
    localStorage.setItem(K_ARCHIVIST_MODEL, archivistModel.trim());
    localStorage.setItem(K_ARCHIVIST_TEMP, String(archivistTemp));
    localStorage.setItem(K_COPILOT_MODEL, copilotModel.trim());
    localStorage.setItem(K_COPILOT_TEMP, String(copilotTemp));
    fileOpStatus = { type: 'success', message: 'AI configuration saved!' };
    setTimeout(() => { fileOpStatus = null; }, 3000);
  }

  // ── Audio Handlers ─────────────────────────────────────────────────────────
  function handleMasterVolume(val: number) {
    masterVol = val;
    audioEngine.setMasterVolume(val / 100);
  }

  function handleAmbienceVolume(val: number) {
    ambienceVol = val;
    audioEngine.setAmbienceVolume(val / 100);
  }

  function handleSfxVolume(val: number) {
    sfxVol = val;
    audioEngine.setSfxVolume(val / 100);
  }

  function handleBufferChange(size: number) {
    bufferSize = size;
    audioEngine.setBufferSize(size);
  }

  async function handleDeviceChange(deviceId: string) {
    selectedDeviceId = deviceId;
    await audioEngine.setOutputDevice(deviceId);
  }

  function formatRelativeTime(ts: number | null): string {
    if (!ts) return 'Never';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-150"
    onclick={() => isOpen = false}
  ></div>

  <!-- Modal Dialog -->
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    class="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:h-[620px] bg-slate-900 border border-slate-700/80 rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden select-none"
  >
    <!-- Top Header -->
    <div class="h-14 bg-slate-950/80 border-b border-slate-800 px-5 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-base border border-indigo-500/30">
          ⚙️
        </div>
        <div>
          <h2 id="modal-title" class="text-sm font-bold text-slate-100 uppercase tracking-wider">Workstation Settings</h2>
          <p class="text-[10px] text-slate-400">Campaign persistence, local AI pipelines &amp; audio routing</p>
        </div>
      </div>
      <button
        type="button"
        onclick={() => isOpen = false}
        class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-sm transition-colors"
        aria-label="Close Settings"
      >
        ✕
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="bg-slate-950 border-b border-slate-800 px-4 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar">
      <button
        type="button"
        onclick={() => activeTab = 'campaign'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'campaign' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>📁 Campaign Files</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'lore'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'lore' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>📚 Lore Ingestion</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'homebrew'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'homebrew' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>⚙️ Homebrew &amp; Rules</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'automation'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'automation' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>🎲 Automation &amp; Dice</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'ai'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'ai' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>🔮 Local AI / Ollama</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'audio'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'audio' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>🔊 Audio &amp; Routing</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'theme'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'theme' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>🎨 UI &amp; Theme</span>
      </button>

      <button
        type="button"
        onclick={() => activeTab = 'plugins'}
        class="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5
          {activeTab === 'plugins' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
      >
        <span>🧩 Plugins &amp; Addons</span>
      </button>
    </div>

    <!-- Notification Toast / Status Banner -->
    {#if fileOpStatus}
      <div class="px-4 py-2 text-xs flex items-center justify-between shrink-0
        {fileOpStatus.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-b border-emerald-800/40' : 'bg-rose-950 text-rose-300 border-b border-rose-800/40'}">
        <span>{fileOpStatus.message}</span>
        <button type="button" onclick={() => fileOpStatus = null} class="font-bold opacity-75 hover:opacity-100">✕</button>
      </div>
    {/if}

    <!-- Content Body -->
    <div class="flex-1 overflow-y-auto p-5 space-y-5 select-text">

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB 1: CAMPAIGN FILE HUB
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'campaign'}
        <div class="space-y-4">
          <!-- Active Campaign Snapshot Card -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Active Campaign</span>
              <h3 class="text-base font-bold text-slate-100">{campaignName}</h3>
              <p class="text-xs text-slate-400 mt-0.5">
                {partyCount} Party Members · {encounterCount} Saved Encounters
              </p>
            </div>
            <div class="text-right">
              <span class="text-[10px] uppercase text-slate-500 font-bold block">Last Saved</span>
              <span class="text-xs font-mono text-slate-300">{formatRelativeTime(lastSavedTime)}</span>
            </div>
          </div>

          <!-- Full Campaign Bundle (.gvtt) Archival Actions -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onclick={handleExportGvtt}
              disabled={isProcessingFile}
              class="p-4 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-left transition-all shadow-md shadow-emerald-700/20 group flex flex-col justify-between"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-2xl">{isProcessingFile ? '⏳' : '📦'}</span>
                <span class="text-[10px] font-mono bg-emerald-800 px-2 py-0.5 rounded text-emerald-100 uppercase font-black">
                  {isProcessingFile ? 'Bundling…' : 'GVTT Bundle'}
                </span>
              </div>
              <div>
                <span class="text-sm font-black block">Export Campaign (.gvtt)</span>
                <span class="text-[11px] text-emerald-100">
                  Full archive with maps, tokens, audio, journal, & SQLite database
                </span>
              </div>
            </button>

            <label class="p-4 bg-slate-800 hover:bg-slate-700/80 border border-emerald-600/50 text-slate-200 rounded-xl text-left transition-all cursor-pointer group flex flex-col justify-between">
              <div class="flex items-center justify-between mb-2">
                <span class="text-2xl">{isProcessingFile ? '⏳' : '📥'}</span>
                <span class="text-[10px] font-mono bg-slate-900 border border-emerald-600/40 px-2 py-0.5 rounded text-emerald-300 uppercase font-black">
                  {isProcessingFile ? 'Unpacking…' : 'Restore GVTT'}
                </span>
              </div>
              <div>
                <span class="text-sm font-black block">Import Campaign (.gvtt)</span>
                <span class="text-[11px] text-slate-400">
                  Unpack and rehydrate maps, assets, and database into active state
                </span>
              </div>
              <input type="file" accept=".gvtt,.zip" class="hidden" onchange={handleImportGvtt} disabled={isProcessingFile} />
            </label>
          </div>

          <!-- Legacy / Snapshot JSON Save & Load Action Buttons -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onclick={handleExport}
              disabled={isProcessingFile}
              class="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-50 text-slate-200 rounded-xl text-left transition-all group flex flex-col justify-between"
            >
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xl">💾</span>
                <span class="text-[9px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase">JSON</span>
              </div>
              <div>
                <span class="text-xs font-bold block text-slate-200">Export State Snapshot</span>
                <span class="text-[10px] text-slate-400">Export roster and combat state to .json</span>
              </div>
            </button>

            <label class="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl text-left transition-all cursor-pointer group flex flex-col justify-between">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xl">📂</span>
                <span class="text-[9px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase">JSON</span>
              </div>
              <div>
                <span class="text-xs font-bold block text-slate-200">Import State Snapshot</span>
                <span class="text-[10px] text-slate-400">Restore roster from .json file</span>
              </div>
              <input type="file" accept=".json" class="hidden" onchange={handleImportFile} disabled={isProcessingFile} />
            </label>
          </div>

          <!-- Auto-Save Configuration -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-slate-200 block">Automatic Background Persistence</span>
                <span class="text-[11px] text-slate-400">Regularly writes full session state to local storage snapshot</span>
              </div>
              <button
                type="button"
                onclick={triggerImmediateAutoSave}
                class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Save Now
              </button>
            </div>

            <div class="flex items-center justify-between pt-1 text-xs">
              <span class="text-slate-400">Auto-Save Interval:</span>
              <div class="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                {#each [
                  { label: 'Disabled', val: 0 },
                  { label: '5 min', val: 5 },
                  { label: '15 min', val: 15 },
                  { label: '30 min', val: 30 }
                ] as opt}
                  <button
                    type="button"
                    onclick={() => handleAutoSaveChange(opt.val)}
                    class="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors
                      {autoSaveMinutes === opt.val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}"
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Last snapshot created:</span>
              <span class="font-mono text-slate-400">{formatRelativeTime(lastAutosavedTime)}</span>
            </div>
          </div>

          <!-- Local IndexedDB Storage Quota & Health Monitor -->
          <StorageStatusWidget />
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB: GROUNDED LORE INGESTION & PURGE
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'lore'}
        <LoreIngestionSettingsTab />
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB: MODULAR HOMEBREW RULES
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'homebrew'}
        <HomebrewSettingsTab />
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB: HYBRID AUTOMATION & PHYSICAL DICE
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'automation'}
        <AutomationSettingsTab />
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB 2: LOCAL AI / OLLAMA SETTINGS
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'ai'}
        <div class="space-y-4 text-xs">
          <!-- Ollama Base URL & Connection -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div class="space-y-1">
              <label for="ollama-url-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Ollama Base Endpoint
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="ollama-url-input"
                  type="url"
                  bind:value={ollamaBaseUrl}
                  placeholder="http://127.0.0.1:11434"
                  class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onclick={testOllamaConnection}
                  disabled={ollamaStatus === 'checking'}
                  class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {ollamaStatus === 'checking' ? 'Testing…' : 'Ping Endpoint'}
                </button>
              </div>
            </div>

            {#if ollamaMessage}
              <div class="p-2 rounded-lg text-[11px] flex items-center gap-2
                {ollamaStatus === 'connected' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40' : 'bg-rose-950/80 text-rose-300 border border-rose-800/40'}">
                <span>{ollamaStatus === 'connected' ? '✅' : '⚠️'}</span>
                <span>{ollamaMessage}</span>
              </div>
            {/if}
          </div>

          <!-- Rules Archivist Model Configuration -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <span class="text-xs font-bold text-indigo-300 block">Rules Archivist (Deterministic Referee)</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label for="archivist-model-input" class="text-[10px] font-semibold text-slate-500 uppercase">Model Identifier</label>
                <input
                  id="archivist-model-input"
                  type="text"
                  bind:value={archivistModel}
                  placeholder="qwen2.5:7b"
                  class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label for="archivist-temp-input" class="text-[10px] font-semibold text-slate-500 uppercase">Temperature (0.0 = Deterministic)</label>
                  <span class="font-mono text-indigo-400 text-xs">{archivistTemp.toFixed(2)}</span>
                </div>
                <input
                  id="archivist-temp-input"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={archivistTemp}
                  class="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <!-- Live DM Co-Pilot Model Configuration -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <span class="text-xs font-bold text-amber-300 block">Live DM Co-Pilot (Creative Improv Partner)</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label for="copilot-model-input" class="text-[10px] font-semibold text-slate-500 uppercase">Model Identifier</label>
                <input
                  id="copilot-model-input"
                  type="text"
                  bind:value={copilotModel}
                  placeholder="qwen2.5:7b"
                  class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label for="copilot-temp-input" class="text-[10px] font-semibold text-slate-500 uppercase">Temperature (Creative Improv)</label>
                  <span class="font-mono text-amber-400 text-xs">{copilotTemp.toFixed(2)}</span>
                </div>
                <input
                  id="copilot-temp-input"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={copilotTemp}
                  class="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <!-- Knowledge Base & RAG Ingestion -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Local Knowledge Base &amp; RAG Chunker</span>
                <p class="text-[11px] text-slate-500">Ingest .md, .txt, and .json rulebooks into IndexedDB semantic chunks</p>
              </div>
              <button
                type="button"
                onclick={() => showKbModal = true}
                class="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-bold transition-colors flex items-center gap-1.5"
              >
                <span>📚</span> Manage KB
              </button>
            </div>
          </div>

          <button
            type="button"
            onclick={saveAiSettings}
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors shadow"
          >
            Apply &amp; Save AI Settings
          </button>
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB 3: AUDIO & ROUTING
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'audio'}
        <div class="space-y-4 text-xs">
          <!-- Audio Output Device -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
            <label for="audio-device-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Audio Output Device
            </label>
            {#if availableDevices.length > 0}
              <select
                id="audio-device-select"
                value={selectedDeviceId}
                onchange={(e) => handleDeviceChange((e.target as HTMLSelectElement).value)}
                class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="default">Default System Audio Output</option>
                {#each availableDevices as dev}
                  <option value={dev.deviceId}>{dev.label || `Audio Device (${dev.deviceId.slice(0, 8)})`}</option>
                {/each}
              </select>
            {:else}
              <div class="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-slate-400">
                <span>Default System Output (Browser device enumeration unavailable or restricted)</span>
              </div>
            {/if}
          </div>

          <!-- Master Buffer Latency -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
            <label for="buffer-size-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Audio Buffer Latency Profile
            </label>
            <select
              id="buffer-size-select"
              value={bufferSize}
              onchange={(e) => handleBufferChange(Number((e.target as HTMLSelectElement).value))}
              class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
            >
              <option value={128}>128 Samples — Ultra-Low Latency (Fastest trigger response)</option>
              <option value={256}>256 Samples — Balanced (Default Workstation)</option>
              <option value={512}>512 Samples — High Stability (Recommended for background streams)</option>
              <option value={1024}>1024 Samples — Maximum Buffer (Prevents underruns on heavy load)</option>
            </select>
          </div>

          <!-- Bus Volume Sliders -->
          <div class="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3.5">
            <span class="text-xs font-bold text-slate-200 block">Bus Volume Controls</span>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="master-vol-range" class="text-[10px] font-semibold text-slate-400 uppercase">Master Volume</label>
                <span class="font-mono text-slate-300">{masterVol}%</span>
              </div>
              <input
                id="master-vol-range"
                type="range"
                min="0"
                max="100"
                bind:value={masterVol}
                oninput={(e) => handleMasterVolume(Number((e.target as HTMLInputElement).value))}
                class="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="ambience-vol-range" class="text-[10px] font-semibold text-slate-400 uppercase">Ambience Bus</label>
                <span class="font-mono text-slate-300">{ambienceVol}%</span>
              </div>
              <input
                id="ambience-vol-range"
                type="range"
                min="0"
                max="100"
                bind:value={ambienceVol}
                oninput={(e) => handleAmbienceVolume(Number((e.target as HTMLInputElement).value))}
                class="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="sfx-vol-range" class="text-[10px] font-semibold text-slate-400 uppercase">SFX Bus</label>
                <span class="font-mono text-slate-300">{sfxVol}%</span>
              </div>
              <input
                id="sfx-vol-range"
                type="range"
                min="0"
                max="100"
                bind:value={sfxVol}
                oninput={(e) => handleSfxVolume(Number((e.target as HTMLInputElement).value))}
                class="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB 4: UI & THEME SETTINGS
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'theme'}
        <div class="space-y-5 text-xs">
          <!-- Interface Theme -->
          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Interface Color Theme</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => uiTheme.setTheme('obsidian')}
                class="p-3 rounded-xl border text-left transition-all
                  {uiTheme.theme === 'obsidian' ? 'bg-slate-950 border-indigo-500 shadow-md text-white' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'}"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="w-3 h-3 rounded-full bg-slate-950 border border-slate-600"></span>
                  <span class="font-semibold text-slate-200">Obsidian (Default Dark)</span>
                </div>
                <span class="text-[10px] text-slate-500 block">Deep slate tones tailored for dim play environments</span>
              </button>

              <button
                type="button"
                onclick={() => uiTheme.setTheme('parchment')}
                class="p-3 rounded-xl border text-left transition-all
                  {uiTheme.theme === 'parchment' ? 'bg-[#18120c] border-amber-500 shadow-md text-amber-200' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'}"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="w-3 h-3 rounded-full bg-amber-800 border border-amber-600"></span>
                  <span class="font-semibold text-amber-200">Aged Parchment</span>
                </div>
                <span class="text-[10px] text-slate-500 block">Warm sepia tones inspired by ancient 5e grimoires</span>
              </button>
            </div>
          </div>

          <!-- UI Scaling -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label for="ui-scaling-range" class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desktop Scale Factor</label>
              <span class="font-mono text-indigo-400 font-bold">{uiTheme.scaling}%</span>
            </div>
            <input
              id="ui-scaling-range"
              type="range"
              min="80"
              max="130"
              step="5"
              value={uiTheme.scaling}
              oninput={(e) => uiTheme.setScaling(Number((e.target as HTMLInputElement).value))}
              class="w-full accent-indigo-500 cursor-pointer"
            />
            <div class="flex items-center justify-between gap-1 pt-1">
              {#each [85, 100, 115, 125] as scale}
                <button
                  type="button"
                  onclick={() => uiTheme.setScaling(scale)}
                  class="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:border-slate-700"
                >
                  {scale}%
                </button>
              {/each}
            </div>
          </div>

          <!-- Display Mode -->
          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Workspace Display Mode</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => uiTheme.setDisplayMode('DM_COMMAND')}
                class="p-2.5 rounded-xl border text-center transition-all
                  {uiTheme.displayMode === 'DM_COMMAND' ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                <span class="font-bold block text-xs">DM Command</span>
                <span class="text-[10px] text-slate-500">Full tools &amp; sidebars</span>
              </button>

              <button
                type="button"
                onclick={() => uiTheme.setDisplayMode('COMPACT')}
                class="p-2.5 rounded-xl border text-center transition-all
                  {uiTheme.displayMode === 'COMPACT' ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
              >
                <span class="font-bold block text-xs">Compact View</span>
                <span class="text-[10px] text-slate-500">Expanded central stage</span>
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB: MODULAR HOMEBREW RULES ENGINE
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'homebrew'}
        <HomebrewSettingsTab />
      {/if}

      <!-- ═════════════════════════════════════════════════════════════════════
           TAB: SANDBOXED PLUGINS & ADDONS
      ══════════════════════════════════════════════════════════════════════ -->
      {#if activeTab === 'plugins'}
        <PluginSettingsTab />
      {/if}

    </div>

    <!-- Modal Footer -->
    <div class="h-12 bg-slate-950/80 border-t border-slate-800 px-5 flex items-center justify-between shrink-0 text-xs">
      <span class="text-slate-500 text-[11px]">Workstation v1.0 · 5e SRD Compliant</span>
      <button
        type="button"
        onclick={() => isOpen = false}
        class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors"
      >
        Close
      </button>
    </div>
  </div>

  <!-- Knowledge Base Modal -->
  <KnowledgeBaseModal bind:isOpen={showKbModal} />
{/if}
