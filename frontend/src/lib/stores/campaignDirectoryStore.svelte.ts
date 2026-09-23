// src/lib/stores/campaignDirectoryStore.svelte.ts
// Svelte 5 Rune-based Campaign Directory Storage & Unified Asset Pipeline Store

import { compendiumDb } from '../db/compendiumDb';

export interface SubfolderStats {
  name: string;
  path: string;
  file_count: number;
}

export interface CampaignDirInfo {
  root_path: string;
  name: string;
  subfolders: SubfolderStats[];
}

const STORAGE_KEY_PATH = 'vtt_campaign_directory_path';
const STORAGE_KEY_INFO = 'vtt_campaign_directory_info';

class CampaignDirectoryStore {
  directoryPath = $state<string | null>(null);
  dirInfo = $state<CampaignDirInfo | null>(null);
  isLoading = $state(false);
  errorMessage = $state<string | null>(null);
  activeAssetList = $state<string[]>([]);

  isConfigured = $derived(!!this.directoryPath);
  mapsStats = $derived(this.dirInfo?.subfolders.find((s) => s.name === 'maps') ?? null);
  audioStats = $derived(this.dirInfo?.subfolders.find((s) => s.name === 'audio') ?? null);
  compendiumsStats = $derived(this.dirInfo?.subfolders.find((s) => s.name === 'compendiums') ?? null);
  tokensStats = $derived(this.dirInfo?.subfolders.find((s) => s.name === 'tokens') ?? null);

  constructor() {
    this.hydrateFromStorage();
    this.refresh();
  }

  private hydrateFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const storedPath = localStorage.getItem(STORAGE_KEY_PATH);
      if (storedPath) this.directoryPath = storedPath;

      const storedInfo = localStorage.getItem(STORAGE_KEY_INFO);
      if (storedInfo) {
        this.dirInfo = JSON.parse(storedInfo);
      }
    } catch {
      // ignore
    }
  }

  async initFromDexie(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      if (compendiumDb.campaignFlags) {
        const rootDirFlag = await compendiumDb.campaignFlags.get('campaignRootDir');
        if (rootDirFlag && typeof rootDirFlag.value === 'string' && rootDirFlag.value.trim() !== '') {
          if (!this.directoryPath) {
            this.directoryPath = rootDirFlag.value.trim();
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private persist() {
    if (typeof localStorage !== 'undefined') {
      try {
        if (this.directoryPath) {
          localStorage.setItem(STORAGE_KEY_PATH, this.directoryPath);
        } else {
          localStorage.removeItem(STORAGE_KEY_PATH);
        }

        if (this.dirInfo) {
          localStorage.setItem(STORAGE_KEY_INFO, JSON.stringify(this.dirInfo));
        } else {
          localStorage.removeItem(STORAGE_KEY_INFO);
        }
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && compendiumDb.campaignFlags) {
      if (this.directoryPath) {
        compendiumDb.campaignFlags.put({ key: 'campaignRootDir', value: this.directoryPath }).catch(() => {});
      }
    }
  }

  async checkHealth(): Promise<{ accessible: boolean; path?: string | null }> {
    if (typeof window === 'undefined') return { accessible: false };
    try {
      const res = await fetch('/api/campaign/directory/status');
      if (res.ok) {
        const data = await res.json();
        return { accessible: !!data.accessible, path: data.path };
      }
      return { accessible: false };
    } catch {
      return { accessible: false };
    }
  }

  async refresh(): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.initFromDexie();
    try {
      const statusRes = await fetch('/api/campaign/directory/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.accessible && status.path) {
          this.directoryPath = status.path;
          this.persist();
          return;
        } else if (this.directoryPath) {
          await this.setDirectory(this.directoryPath);
          return;
        }
      }

      const res = await fetch('/api/campaign/directory/current');
      if (res.ok) {
        const data = await res.json();
        if (data?.root_path || data?.path) {
          const p = data.root_path ?? data.path;
          this.directoryPath = p;
          this.persist();
        } else if (this.directoryPath) {
          await this.setDirectory(this.directoryPath);
        }
      }
    } catch {
      // fallback in offline mode
    }
    await this.loadAssetList();
  }

  async loadAssetList(): Promise<string[]> {
    if (typeof window === 'undefined') return [];
    try {
      const res = await fetch('/api/campaign/assets');
      if (res.ok) {
        const files: string[] = await res.json();
        this.activeAssetList = files;
        return files;
      }
    } catch {
      // fallback
    }
    return this.activeAssetList;
  }

  async selectDirectory(): Promise<CampaignDirInfo | string | null> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      let dialog = win.__TAURI__?.dialog ?? win.__TAURI_PLUGIN_DIALOG__;
      if (!dialog) {
        try {
          const mod = '@tauri-apps/plugin-dialog';
          dialog = await import(/* @vite-ignore */ mod);
        } catch {
          // ignore
        }
      }

      if (dialog && typeof dialog.open === 'function') {
        const selected = await dialog.open({
          directory: true,
          multiple: false,
          title: 'Select Campaign Directory',
        });

        if (!selected) {
          return null;
        }

        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        if (typeof selectedPath === 'string' && selectedPath.trim()) {
          const cleanPath = selectedPath.trim();
          const info = await this.setDirectory(cleanPath);
          return info ?? cleanPath;
        }
        return null;
      }

      const res = await fetch('/api/campaign/directory/select', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Failed to select directory: ${res.statusText}`);
      }

      const data: any = await res.json();
      if (!data) return null;

      if (typeof data === 'string') {
        const cleanPath = data.trim();
        if (cleanPath) {
          const info = await this.setDirectory(cleanPath);
          return info ?? cleanPath;
        }
        return null;
      }

      const pathStr = data.root_path ?? data.path ?? data.directoryPath;
      if (pathStr) {
        this.dirInfo = data.root_path ? data : {
          root_path: pathStr,
          name: pathStr.split(/[\\/]/).filter(Boolean).pop() || 'Campaign',
          subfolders: data.subfolders ?? [],
        };
        this.directoryPath = pathStr;
        this.persist();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vtt:campaign-directory-changed', { detail: this.dirInfo })
          );
        }
        return this.dirInfo;
      }
      return null;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error selecting folder';
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  async setDirectory(path: string): Promise<CampaignDirInfo | null> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const res = await fetch('/api/campaign/directory/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!res.ok) {
        throw new Error(`Failed to set directory: ${res.statusText}`);
      }

      const data: CampaignDirInfo = await res.json();
      this.dirInfo = data;
      this.directoryPath = data.root_path;
      this.persist();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vtt:campaign-directory-changed', { detail: data })
        );
      }
      return data;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error setting directory';
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  getAssetUrl(subfolder: 'maps' | 'audio' | 'compendiums' | 'tokens', filename: string): string {
    return `/api/campaign/assets/${subfolder}/${encodeURIComponent(filename)}`;
  }

  async saveAsset(
    subfolder: 'maps' | 'audio' | 'compendiums' | 'tokens',
    filename: string,
    dataBase64: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const res = await fetch('/api/campaign/assets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subfolder, filename, data_base64: dataBase64 }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || res.statusText);
      }

      const result = await res.json();
      await this.refresh();
      return result;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save asset' };
    }
  }
}

export const campaignDirectoryStore = new CampaignDirectoryStore();
