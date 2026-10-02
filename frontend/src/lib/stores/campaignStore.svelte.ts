// src/lib/stores/campaignStore.svelte.ts
// Svelte 5 Rune-based Campaign Identity & Wizard Persistence Store

import { compendiumDb } from '../db/compendiumDb';

export interface CampaignIdentity {
  campaignName: string;
  dmAlias: string;
  masterPin: string;
}

export interface WorkspaceConfig {
  version: string;
  name: string;
  created_at: number;
  active_scene_id: string | null;
}

export interface WorkspaceMetadata {
  root_path: string;
  config: WorkspaceConfig;
  db_path: string;
  is_valid: boolean;
}

export class CampaignStore {
  campaignName = $state<string>('Default Campaign');
  dmAlias = $state<string>('Dungeon Master');
  masterPin = $state<string>('1337');
  hasCompletedWizard = $state<boolean>(false);
  isLoaded = $state<boolean>(false);
  workspacePath = $state<string | null>(null);
  workspaceReady = $state<boolean>(false);
  workspaceConfig = $state<WorkspaceConfig | null>(null);
  activeSceneId = $state<string | null>(null);
  initPromise: Promise<void>;

  constructor() {
    this.hydrateFromLocalStorage();
    this.initPromise = Promise.all([
      this.initFromDexie(),
      this.initWorkspace(),
    ]).then(() => {
      this.isLoaded = true;
    });
  }

  private hydrateFromLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const storedName = localStorage.getItem('vtt_campaign_name');
      if (storedName) this.campaignName = storedName;

      const storedDm = localStorage.getItem('vtt_dm_name');
      if (storedDm) this.dmAlias = storedDm;

      const storedPin = localStorage.getItem('vtt_active_pin');
      if (storedPin) this.masterPin = storedPin;

      const storedWs = localStorage.getItem('vtt_workspace_path');
      if (storedWs) this.workspacePath = storedWs;

      const completed =
        localStorage.getItem('graywood_wizard_completed') === 'true' ||
        localStorage.getItem('vtt_setup_completed') === 'true' ||
        localStorage.getItem('vtt_setup_complete') === 'true' ||
        localStorage.getItem('hasCompletedWizard') === 'true';
      this.hasCompletedWizard = completed;
    } catch {
      // ignore
    }
  }

  async initWorkspace(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: <T>(cmd: string, args?: unknown) => Promise<T> } } }).__TAURI__;
      if (tauri?.core?.invoke) {
        const activeWs = await tauri.core.invoke<WorkspaceMetadata | null>('get_active_workspace');
        if (activeWs && activeWs.is_valid) {
          this.workspacePath = activeWs.root_path;
          this.workspaceReady = true;
          this.workspaceConfig = activeWs.config;
          if (activeWs.config?.name) {
            this.campaignName = activeWs.config.name;
          }
          if (activeWs.config?.active_scene_id) {
            this.activeSceneId = activeWs.config.active_scene_id;
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to auto-mount active workspace on startup:', err);
    }
  }

  async setWorkspace(path: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: <T>(cmd: string, args?: unknown) => Promise<T> } } }).__TAURI__;
      if (tauri?.core?.invoke) {
        const config = await tauri.core.invoke<WorkspaceConfig>('set_active_workspace', { path });
        if (config) {
          this.workspacePath = path;
          this.workspaceReady = true;
          this.workspaceConfig = config;
          if (config.name) {
            this.campaignName = config.name;
          }
          if (config.active_scene_id) {
            this.activeSceneId = config.active_scene_id;
          }
          await this.persistFlags();
          return true;
        }
      }
    } catch (err) {
      console.error('Failed to set active workspace:', err);
    }
    return false;
  }

  async validateWorkspace(path: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const tauri = (window as unknown as { __TAURI__?: { core?: { invoke: <T>(cmd: string, args?: unknown) => Promise<T> } } }).__TAURI__;
      if (tauri?.core?.invoke) {
        return await tauri.core.invoke<boolean>('validate_workspace', { path });
      }
    } catch {
      return false;
    }
    return false;
  }

  private async initFromDexie(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        if (compendiumDb.campaignFlags) {
          const profileFlag = await compendiumDb.campaignFlags.get('activeCampaignProfile');
          if (profileFlag && typeof profileFlag.value === 'string' && profileFlag.value.trim() !== '') {
            this.campaignName = profileFlag.value;
          }

          const nameFlag = await compendiumDb.campaignFlags.get('campaignName');
          if (nameFlag && typeof nameFlag.value === 'string' && nameFlag.value.trim() !== '') {
            this.campaignName = nameFlag.value;
          }

          const dmFlag = await compendiumDb.campaignFlags.get('dmAlias');
          if (dmFlag && typeof dmFlag.value === 'string' && dmFlag.value.trim() !== '') {
            this.dmAlias = dmFlag.value;
          }

          const pinFlag = await compendiumDb.campaignFlags.get('masterPin');
          if (pinFlag && typeof pinFlag.value === 'string' && pinFlag.value.trim() !== '') {
            this.masterPin = pinFlag.value;
          }

          const wizardFlag = await compendiumDb.campaignFlags.get('hasCompletedWizard');
          if (wizardFlag && (wizardFlag.value === true || wizardFlag.value === 'true')) {
            this.hasCompletedWizard = true;
          }
        }
      } catch (err) {
        console.warn('Failed to hydrate campaign flags from Dexie:', err);
      }
    }
    this.isLoaded = true;
  }

  async persistFlags(): Promise<void> {
    if (typeof window !== 'undefined' && compendiumDb.campaignFlags) {
      try {
        await compendiumDb.campaignFlags.bulkPut([
          { key: 'campaignName', value: this.campaignName },
          { key: 'activeCampaignProfile', value: this.campaignName },
          { key: 'dmAlias', value: this.dmAlias },
          { key: 'masterPin', value: this.masterPin },
          { key: 'hasCompletedWizard', value: this.hasCompletedWizard }
        ]);
      } catch (err) {
        console.warn('Failed to persist campaign flags to Dexie:', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vtt_campaign_name', this.campaignName);
        localStorage.setItem('vtt_dm_name', this.dmAlias);
        localStorage.setItem('vtt_active_pin', this.masterPin);
        if (this.workspacePath) {
          localStorage.setItem('vtt_workspace_path', this.workspacePath);
        }
        if (this.hasCompletedWizard) {
          localStorage.setItem('graywood_wizard_completed', 'true');
          localStorage.setItem('vtt_setup_completed', 'true');
          localStorage.setItem('vtt_setup_complete', 'true');
          localStorage.setItem('hasCompletedWizard', 'true');
        }
      } catch {
        // ignore
      }
    }
  }

  async setIdentity(identity: Partial<CampaignIdentity>): Promise<void> {
    if (identity.campaignName !== undefined) this.campaignName = identity.campaignName;
    if (identity.dmAlias !== undefined) this.dmAlias = identity.dmAlias;
    if (identity.masterPin !== undefined) this.masterPin = identity.masterPin;
    await this.persistFlags();
  }

  async completeWizard(): Promise<void> {
    this.hasCompletedWizard = true;
    await this.persistFlags();
  }

  async resetWizard(): Promise<void> {
    this.hasCompletedWizard = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('graywood_wizard_completed');
      localStorage.removeItem('vtt_setup_completed');
      localStorage.removeItem('vtt_setup_complete');
      localStorage.removeItem('hasCompletedWizard');
    }
    if (typeof window !== 'undefined' && compendiumDb.campaignFlags) {
      try {
        await compendiumDb.campaignFlags.put({ key: 'hasCompletedWizard', value: false });
      } catch {
        // ignore
      }
    }
  }
}

export const campaignStore = new CampaignStore();
