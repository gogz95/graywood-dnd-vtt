// src/lib/stores/campaignDirectoryStore.svelte.ts
// Svelte 5 Rune-based Campaign Directory Storage & Unified Asset Pipeline Store

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

  private persist() {
    if (typeof localStorage === 'undefined') return;
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

  async refresh(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/campaign/directory/current');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          this.dirInfo = data;
          this.directoryPath = data.root_path;
          this.persist();
        } else if (this.directoryPath) {
          // Sync existing stored path to backend
          await this.setDirectory(this.directoryPath);
        }
      }
    } catch {
      // fallback in offline mode
    }
  }

  async selectDirectory(): Promise<CampaignDirInfo | null> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const res = await fetch('/api/campaign/directory/select', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Failed to select directory: ${res.statusText}`);
      }

      const data: CampaignDirInfo | null = await res.json();
      if (data) {
        this.dirInfo = data;
        this.directoryPath = data.root_path;
        this.persist();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vtt:campaign-directory-changed', { detail: data })
          );
        }
        return data;
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
