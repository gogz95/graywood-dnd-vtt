// ... existing code ...

export const bestiaryStore = defineStore('bestiaryStore', {
    state: () => ({
        // ... existing state ...
        availableSources: $state<string[]>([]),
    }),
    actions: {
        // ... existing actions ...
        async fetchSources() {
            const sources = await api.getBestiarySources();
            this.availableSources = sources;
        },
    },
});

// ... existing code ...