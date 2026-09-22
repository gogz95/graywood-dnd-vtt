import { invoke } from '@tauri-apps/api/core';
class BestiaryStore {
    availableSources = $state<string[]>([]);
    isLoading = $state(false);
    error = $state<string | null>(null);

    async fetchSources() {
        this.isLoading = true;
        this.error = null;
        try {
            this.availableSources = await invoke<string[]>('get_bestiary_sources');
        } catch (e) {
            this.error = String(e);
        } finally {
            this.isLoading = false;
        }
    }
}

export const bestiaryStore = new BestiaryStore();