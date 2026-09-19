// campaignPersistence.ts — Persistent disk bundle utility for 5e VTT campaign states
// Exports and imports unified campaign bundles supporting both Tauri native OS files and browser downloads.

export interface CampaignMetadata {
  campaignName: string;
  schemaVersion: '1.0.0';
  exportTimestamp: number;
  appVersion: string;
}

export interface BattleMatState {
  mapImageUrl?: string;
  gridSize?: number;
  gridOpacity?: number;
  gridSnap?: boolean;
}

export interface AiSubsystemState {
  archivistChat?: unknown[];
  archivistKb?: unknown[];
  archivistModel?: string;
  archivistTemp?: number;
  copilotChat?: unknown[];
  copilotKb?: unknown[];
  copilotModel?: string;
  copilotTemp?: number;
  ollamaBaseUrl?: string;
}

export interface CampaignBundle {
  metadata: CampaignMetadata;
  party: unknown[];
  encounters: Record<string, unknown>;
  calendar: unknown;
  compendium: unknown[];
  battlemat?: BattleMatState;
  ai?: AiSubsystemState;
  atlas?: {
    toolConfigs?: unknown[];
    handoutContent?: string;
  };
}

// ── Storage Keys ──────────────────────────────────────────────────────────────
export const K_CAMPAIGN_NAME     = 'vtt_campaign_name';
export const K_SETUP_COMPLETE    = 'vtt_setup_complete';
export const K_PARTY_ROSTER      = 'vtt_party_roster';
export const K_ENCOUNTERS        = 'vtt_encounters';
export const K_CALENDAR_CONFIG   = 'vtt_calendar_config';
export const K_COMPENDIUM_DATA   = 'vtt_compendium_imports';
export const K_ARCHIVIST_CHAT    = 'vtt_archivist_chat';
export const K_ARCHIVIST_KB      = 'vtt_archivist_kb';
export const K_ARCHIVIST_MODEL   = 'vtt_archivist_model';
export const K_ARCHIVIST_TEMP    = 'vtt_archivist_temp';
export const K_COPILOT_CHAT      = 'vtt_copilot_chat';
export const K_COPILOT_KB        = 'vtt_copilot_kb';
export const K_COPILOT_MODEL     = 'vtt_copilot_model';
export const K_COPILOT_TEMP      = 'vtt_copilot_temp';
export const K_OLLAMA_BASE_URL   = 'vtt_ollama_base_url';
export const K_ATLAS_CONFIGS     = 'vtt_atlas_tool_configs_v1';
export const K_ATLAS_HANDOUT     = 'vtt_atlas_handout_content_v1';
export const K_LAST_SAVED        = 'vtt_last_saved_timestamp';
export const K_AUTOSAVE_DATA     = 'vtt_campaign_autosave';
export const K_LAST_AUTOSAVE     = 'vtt_last_autosave_timestamp';
export const K_AUTOSAVE_INTERVAL = 'vtt_autosave_interval'; // in minutes: 0, 5, 15, 30

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Builds a complete CampaignBundle from current active application state.
 */
export function buildCampaignBundle(): CampaignBundle {
  const campaignName = localStorage.getItem(K_CAMPAIGN_NAME) || 'My 5e Campaign';

  return {
    metadata: {
      campaignName,
      schemaVersion: '1.0.0',
      exportTimestamp: Date.now(),
      appVersion: '1.0.0',
    },
    party: safeJsonParse<unknown[]>(localStorage.getItem(K_PARTY_ROSTER), []),
    encounters: safeJsonParse<Record<string, unknown>>(localStorage.getItem(K_ENCOUNTERS), {}),
    calendar: safeJsonParse<unknown>(localStorage.getItem(K_CALENDAR_CONFIG), null),
    compendium: safeJsonParse<unknown[]>(localStorage.getItem(K_COMPENDIUM_DATA), []),
    battlemat: {
      mapImageUrl: localStorage.getItem('vtt_battlemat_map_url') || '',
      gridSize: Number(localStorage.getItem('vtt_battlemat_grid_size') || 60),
      gridOpacity: Number(localStorage.getItem('vtt_battlemat_grid_opacity') || 0.35),
      gridSnap: localStorage.getItem('vtt_battlemat_grid_snap') !== 'false',
    },
    ai: {
      archivistChat: safeJsonParse<unknown[]>(localStorage.getItem(K_ARCHIVIST_CHAT), []),
      archivistKb: safeJsonParse<unknown[]>(localStorage.getItem(K_ARCHIVIST_KB), []),
      archivistModel: localStorage.getItem(K_ARCHIVIST_MODEL) || 'qwen2.5:7b',
      archivistTemp: Number(localStorage.getItem(K_ARCHIVIST_TEMP) || 0.0),
      copilotChat: safeJsonParse<unknown[]>(localStorage.getItem(K_COPILOT_CHAT), []),
      copilotKb: safeJsonParse<unknown[]>(localStorage.getItem(K_COPILOT_KB), []),
      copilotModel: localStorage.getItem(K_COPILOT_MODEL) || 'qwen2.5:7b',
      copilotTemp: Number(localStorage.getItem(K_COPILOT_TEMP) || 0.6),
      ollamaBaseUrl: localStorage.getItem(K_OLLAMA_BASE_URL) || 'http://127.0.0.1:11434',
    },
    atlas: {
      toolConfigs: safeJsonParse<unknown[]>(localStorage.getItem(K_ATLAS_CONFIGS), []),
      handoutContent: localStorage.getItem(K_ATLAS_HANDOUT) || '',
    },
  };
}

/**
 * Saves the campaign state to file (native OS dialog in Tauri, or browser file download).
 */
export async function saveCampaignToFile(): Promise<{ success: boolean; filename: string; path?: string }> {
  const bundle = buildCampaignBundle();
  const timestampStr = new Date(bundle.metadata.exportTimestamp)
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const cleanName = bundle.metadata.campaignName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `campaign_${cleanName}_${timestampStr}.json`;
  const jsonContent = JSON.stringify(bundle, null, 2);

  // Update last saved timestamp
  localStorage.setItem(K_LAST_SAVED, String(Date.now()));

  // 1. If in Tauri desktop app, use native file-saver
  if (isTauriEnvironment()) {
    try {
      const tauri = (window as unknown as {
        __TAURI__?: {
          dialog?: { save: (opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null> };
          fs?: { writeTextFile: (path: string, contents: string) => Promise<void> };
        };
      }).__TAURI__;

      if (tauri?.dialog?.save && tauri?.fs?.writeTextFile) {
        const selectedPath = await tauri.dialog.save({
          defaultPath: filename,
          filters: [{ name: 'Campaign Bundle', extensions: ['json'] }],
        });
        if (selectedPath) {
          await tauri.fs.writeTextFile(selectedPath, jsonContent);
          return { success: true, filename, path: selectedPath };
        }
        return { success: false, filename };
      }
    } catch (err) {
      console.warn('Tauri native save failed, falling back to browser download:', err);
    }
  }

  // 2. Web browser fallback: trigger standard blob file download
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, filename };
}

/**
 * Validates and atomically loads a CampaignBundle, populating all state stores.
 */
export function restoreCampaignBundle(bundle: CampaignBundle): { success: boolean; error?: string } {
  if (!bundle || typeof bundle !== 'object') {
    return { success: false, error: 'Invalid file format: content is not a JSON object.' };
  }

  if (!bundle.metadata || !bundle.metadata.schemaVersion) {
    return { success: false, error: 'Unrecognized campaign format: missing schema metadata.' };
  }

  try {
    // 1. Campaign Name & Setup Status
    if (bundle.metadata.campaignName) {
      localStorage.setItem(K_CAMPAIGN_NAME, bundle.metadata.campaignName);
    }
    localStorage.setItem(K_SETUP_COMPLETE, 'true');

    // 2. Party Roster
    if (Array.isArray(bundle.party)) {
      localStorage.setItem(K_PARTY_ROSTER, JSON.stringify(bundle.party));
    }

    // 3. Encounters & Combat
    if (bundle.encounters && typeof bundle.encounters === 'object') {
      localStorage.setItem(K_ENCOUNTERS, JSON.stringify(bundle.encounters));
    }

    // 4. Calendar
    if (bundle.calendar) {
      localStorage.setItem(K_CALENDAR_CONFIG, JSON.stringify(bundle.calendar));
    }

    // 5. Compendium Custom Imports
    if (Array.isArray(bundle.compendium)) {
      localStorage.setItem(K_COMPENDIUM_DATA, JSON.stringify(bundle.compendium));
    }

    // 6. AI Subsystem (Chat histories, models, and KBs)
    if (bundle.ai) {
      if (Array.isArray(bundle.ai.archivistChat)) {
        localStorage.setItem(K_ARCHIVIST_CHAT, JSON.stringify(bundle.ai.archivistChat));
      }
      if (Array.isArray(bundle.ai.archivistKb)) {
        localStorage.setItem(K_ARCHIVIST_KB, JSON.stringify(bundle.ai.archivistKb));
      }
      if (bundle.ai.archivistModel) {
        localStorage.setItem(K_ARCHIVIST_MODEL, bundle.ai.archivistModel);
      }
      if (bundle.ai.archivistTemp !== undefined) {
        localStorage.setItem(K_ARCHIVIST_TEMP, String(bundle.ai.archivistTemp));
      }

      if (Array.isArray(bundle.ai.copilotChat)) {
        localStorage.setItem(K_COPILOT_CHAT, JSON.stringify(bundle.ai.copilotChat));
      }
      if (Array.isArray(bundle.ai.copilotKb)) {
        localStorage.setItem(K_COPILOT_KB, JSON.stringify(bundle.ai.copilotKb));
      }
      if (bundle.ai.copilotModel) {
        localStorage.setItem(K_COPILOT_MODEL, bundle.ai.copilotModel);
      }
      if (bundle.ai.copilotTemp !== undefined) {
        localStorage.setItem(K_COPILOT_TEMP, String(bundle.ai.copilotTemp));
      }
      if (bundle.ai.ollamaBaseUrl) {
        localStorage.setItem(K_OLLAMA_BASE_URL, bundle.ai.ollamaBaseUrl);
      }
    }

    // 7. Atlas Hub & Handout Formatter
    if (bundle.atlas) {
      if (Array.isArray(bundle.atlas.toolConfigs)) {
        localStorage.setItem(K_ATLAS_CONFIGS, JSON.stringify(bundle.atlas.toolConfigs));
      }
      if (bundle.atlas.handoutContent) {
        localStorage.setItem(K_ATLAS_HANDOUT, bundle.atlas.handoutContent);
      }
    }

    // 8. Battle Mat Map
    if (bundle.battlemat?.mapImageUrl) {
      localStorage.setItem('vtt_battlemat_map_url', bundle.battlemat.mapImageUrl);
      window.dispatchEvent(new CustomEvent('vtt:load-battle-map', { detail: { url: bundle.battlemat.mapImageUrl } }));
    }

    // Notify all components of atomic update
    window.dispatchEvent(new CustomEvent('vtt:campaign-loaded', { detail: { bundle } }));

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reads a File object (from file input or drop), parses JSON, and restores campaign.
 */
export async function loadCampaignFromFile(file: File): Promise<{ success: boolean; error?: string }> {
  try {
    const text = await file.text();
    const bundle = JSON.parse(text) as CampaignBundle;
    return restoreCampaignBundle(bundle);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Invalid JSON file.' };
  }
}

// ── Background Auto-Saver Routine ─────────────────────────────────────────────
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

export function executeAutoSave(): void {
  try {
    const bundle = buildCampaignBundle();
    localStorage.setItem(K_AUTOSAVE_DATA, JSON.stringify(bundle));
    localStorage.setItem(K_LAST_AUTOSAVE, String(Date.now()));
    window.dispatchEvent(new CustomEvent('vtt:autosave-success', { detail: { timestamp: Date.now() } }));
  } catch (err) {
    console.warn('Auto-save failed:', err);
  }
}

export function initAutoSaver(): () => void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  const intervalMinutes = Number(localStorage.getItem(K_AUTOSAVE_INTERVAL) || '5');

  if (intervalMinutes > 0) {
    const intervalMs = intervalMinutes * 60 * 1000;
    autoSaveTimer = setInterval(() => {
      executeAutoSave();
    }, intervalMs);
  }

  return () => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  };
}

export function setAutoSaveInterval(minutes: number): void {
  localStorage.setItem(K_AUTOSAVE_INTERVAL, String(minutes));
  initAutoSaver();
}

export function getLastSavedTimestamp(): number | null {
  const raw = localStorage.getItem(K_LAST_SAVED);
  return raw ? Number(raw) : null;
}

export function getLastAutosaveTimestamp(): number | null {
  const raw = localStorage.getItem(K_LAST_AUTOSAVE);
  return raw ? Number(raw) : null;
}
