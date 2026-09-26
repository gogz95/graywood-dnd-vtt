// src/lib/stores/sourceEngineStore.svelte.ts
// Source Engine & Co-Pilot Store with FTS5 and Local AI Fallback

import { searchGroundedSources, type SearchResultMatch } from '../services/sourceSearch';

export type SearchEngineStatus = 'Ready' | 'Searching' | 'Ollama Offline - Using Keyword Search';

export interface LoreChunkMatch {
  id: string;
  document_title: string;
  chunk_index: number;
  content_text: string;
  tags: string;
  score: number;
}

class SourceEngineStore {
  query = $state('');
  status = $state<SearchEngineStatus>('Ready');
  results = $state<LoreChunkMatch[]>([]);
  isSearching = $state(false);
  errorMessage = $state<string | null>(null);
  fallbackActive = $state(false);

  async search(rawQuery: string): Promise<LoreChunkMatch[]> {
    const q = rawQuery.trim();
    this.query = q;
    this.errorMessage = null;

    if (!q) {
      this.results = [];
      this.status = 'Ready';
      this.fallbackActive = false;
      return [];
    }

    this.isSearching = true;
    this.status = 'Searching';

    try {
      // 1. Query relative endpoint /api/lore/search?q=...
      const res = await fetch(`/api/lore/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.matches) && data.matches.length > 0) {
          this.results = data.matches;
          this.fallbackActive = data.fallback_used ?? false;
          this.status = this.fallbackActive ? 'Ollama Offline - Using Keyword Search' : 'Ready';
          return this.results;
        }
      }
    } catch {
      // Backend server unavailable or offline
    }

    // 2. Seamless local client-side fallback using sourceDb / searchGroundedSources
    try {
      this.fallbackActive = true;
      this.status = 'Ollama Offline - Using Keyword Search';
      const localMatches: SearchResultMatch[] = await searchGroundedSources(q);
      this.results = localMatches.map((m) => ({
        id: m.chunkId,
        document_title: m.docName,
        chunk_index: 0,
        content_text: m.fullText,
        tags: m.sectionHeader,
        score: m.score,
      }));
      return this.results;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Search failed';
      this.results = [];
      return [];
    } finally {
      this.isSearching = false;
    }
  }

  clear() {
    this.query = '';
    this.results = [];
    this.status = 'Ready';
    this.errorMessage = null;
    this.fallbackActive = false;
  }
}

export const sourceEngineStore = new SourceEngineStore();
export const loreEngineStore = sourceEngineStore;
