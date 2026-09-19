import type { ActiveCombatant, MonsterStatBlock } from '../components/dm/EncounterDashboard.svelte';

export interface SpawnCombatantPayload {
  encounter_id: string;
  monster_compendium_id: string;
  custom_name?: string;
  initiative?: number;
  canvas_x: number;
  canvas_y: number;
}

export interface SpawnCombatantResult {
  combatant: ActiveCombatant;
  token_id: string;
  canvas_x: number;
  canvas_y: number;
}

export interface ExportArchiveResult {
  success: boolean;
  message: string;
  archive_path: string;
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/**
 * Spawns a monster onto the tactical battle mat canvas, persists it in SQLite `active_combatants`,
 * maps AC/HP/multiattack, and triggers real-time WebSocket broadcast.
 * Uses native Tauri IPC if running in desktop app, or falls back to REST API over LAN.
 */
export async function spawnCombatantToken(
  payload: SpawnCombatantPayload
): Promise<SpawnCombatantResult> {
  if (isTauriEnvironment()) {
    try {
      const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args: unknown) => Promise<SpawnCombatantResult> } } }).__TAURI__;
      if (tauri?.core?.invoke) {
        return await tauri.core.invoke('spawn_combatant_token', payload);
      }
    } catch (ipcErr) {
      console.warn('Tauri IPC failed, falling back to REST endpoint:', ipcErr);
    }
  }

  // REST API fallback for web browser & LAN mobile clients
  const response = await fetch('/api/encounter/spawn_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to spawn combatant token: ${errorText}`);
  }

  return (await response.json()) as SpawnCombatantResult;
}

/**
 * Packages the campaign SQLite database, asset directory, and metadata
 * into a compressed `.zip` archive file for disaster recovery.
 */
export async function exportCampaignArchive(
  outputPath?: string
): Promise<ExportArchiveResult> {
  if (isTauriEnvironment()) {
    try {
      const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args: unknown) => Promise<string> } } }).__TAURI__;
      if (tauri?.core?.invoke) {
        const msg = await tauri.core.invoke('export_campaign_archive', {
          path: outputPath ?? 'campaign_backup.zip',
        });
        return {
          success: true,
          message: msg,
          archive_path: outputPath ?? 'campaign_backup.zip',
        };
      }
    } catch (ipcErr) {
      console.warn('Tauri IPC failed, falling back to REST endpoint:', ipcErr);
    }
  }

  // REST API fallback
  const response = await fetch('/api/campaign/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      output_path: outputPath,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to export campaign archive: ${errorText}`);
  }

  return (await response.json()) as ExportArchiveResult;
}
