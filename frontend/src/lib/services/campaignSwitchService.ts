// src/lib/services/campaignSwitchService.ts
// Campaign Profile Switching & Engine Reset Service

import { audioEngine } from '$lib/services/audioEngine';
import { audioEngine as coreAudioEngine } from '$lib/audio/AudioEngine';
import { pixiLifecycle } from '$lib/services/pixiLifecycle';
import { wallStore } from '$lib/stores/wallStore.svelte';
import { combatStore } from '$lib/stores/combatStore.svelte';
import { tokenStore } from '$lib/stores/tokenStore.svelte';
import { campaignDirectoryStore, type CampaignDirInfo } from '$lib/stores/campaignDirectoryStore.svelte';
import { campaignStore } from '$lib/stores/campaignStore.svelte';
import { compendiumDb, ensureSrdBaseline } from '$lib/db/compendiumDb';

export interface CampaignSwitchResult {
  success: boolean;
  newPath: string;
  dirInfo?: CampaignDirInfo | null;
  error?: string;
}

/**
 * Executes a clean campaign unload and transition:
 * 1. Halts active audio playback across all channels.
 * 2. Purges PixiJS map textures from GPU VRAM.
 * 3. Flushes wall collision and line-of-sight segments.
 * 4. Clears active combat turn order and canvas tokens.
 * 5. Reconfigures the Axum static asset route root to the newly selected folder.
 * 6. Re-initializes Dexie table indices and campaign profile flags.
 */
export async function switchCampaignProfile(folderPath: string): Promise<CampaignSwitchResult> {
  try {
    // 1. Halt all active audio playback
    audioEngine.stopAll(true);
    if (typeof coreAudioEngine.stopAll === 'function') {
      coreAudioEngine.stopAll();
    }

    // 2. Purge PixiJS map textures from GPU VRAM
    pixiLifecycle.purgeUnusedTextures();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:purge-vram'));
    }

    // 3. Flush wall collider store
    wallStore.clear();

    // 4. Clear active combat state and battlemat tokens
    combatStore.endCombat();
    tokenStore.tokens = [];

    // 5. Reconfigure Axum static asset route root to the new campaign folder
    const dirInfo = await campaignDirectoryStore.setDirectory(folderPath);
    if (!dirInfo) {
      throw new Error(`Failed to configure campaign directory at: ${folderPath}`);
    }

    // 6. Re-initialize Dexie table flags and ensure SRD compendium baseline
    if (compendiumDb.campaignFlags) {
      await compendiumDb.campaignFlags.bulkPut([
        { key: 'campaignRootDir', value: folderPath },
        { key: 'activeCampaignProfile', value: dirInfo.name },
        { key: 'campaignName', value: dirInfo.name }
      ]);
    }
    campaignStore.campaignName = dirInfo.name;
    await campaignStore.persistFlags();
    await ensureSrdBaseline();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:campaign-switched', { detail: dirInfo })
      );
    }

    return { success: true, newPath: folderPath, dirInfo };
  } catch (err: any) {
    console.error('Failed to switch campaign profile:', err);
    return {
      success: false,
      newPath: folderPath,
      error: err?.message || String(err)
    };
  }
}
