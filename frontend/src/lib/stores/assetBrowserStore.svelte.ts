// src/lib/stores/assetBrowserStore.svelte.ts
// Asynchronous non-blocking campaign image asset store and indexer

export type AssetCategory = 'all' | 'map' | 'token' | 'prop' | 'handout';

export interface CampaignAsset {
  id: string;
  name: string;
  filename: string;
  relative_path: string;
  url: string;
  category: 'map' | 'token' | 'prop' | 'handout';
  size_bytes: number;
  extension: string;
}

class AssetBrowserStore {
  isOpen = $state(false);
  isLoading = $state(false);
  assets = $state<CampaignAsset[]>([]);
  searchQuery = $state('');
  selectedCategory = $state<AssetCategory>('all');
  errorMessage = $state<string | null>(null);

  // Derived filtered asset list
  filteredAssets = $derived.by(() => {
    let list = this.assets;

    if (this.selectedCategory !== 'all') {
      list = list.filter((a) => a.category === this.selectedCategory);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.filename.toLowerCase().includes(q) ||
          a.relative_path.toLowerCase().includes(q)
      );
    }

    return list;
  });

  categoryCounts = $derived.by(() => {
    const counts: Record<AssetCategory, number> = {
      all: this.assets.length,
      map: 0,
      token: 0,
      prop: 0,
      handout: 0,
    };
    for (const a of this.assets) {
      if (counts[a.category] !== undefined) {
        counts[a.category]++;
      }
    }
    return counts;
  });

  async refreshAssets() {
    this.isLoading = true;
    this.errorMessage = null;
    try {
      const res = await fetch('/api/campaign/assets/browse');
      if (res.ok) {
        const data = (await res.json()) as CampaignAsset[];
        this.assets = Array.isArray(data) ? data : [];
      } else {
        this.errorMessage = `Failed to index assets: HTTP ${res.status}`;
      }
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : 'Network error loading assets';
    } finally {
      this.isLoading = false;
    }
  }

  open() {
    this.isOpen = true;
    if (this.assets.length === 0) {
      this.refreshAssets().catch(() => {});
    }
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}

export const assetBrowserStore = new AssetBrowserStore();
