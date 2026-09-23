async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn === 'function') {
        return invokeFn(cmd, args);
    }
    throw new Error('Tauri API is not available');
}

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