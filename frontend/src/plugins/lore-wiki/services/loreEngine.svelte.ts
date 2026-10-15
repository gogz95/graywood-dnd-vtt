// frontend/src/plugins/lore-wiki/services/loreEngine.svelte.ts
// Bidirectional Markdown Lore Wiki & Theatrical Handout Engine with Svelte 5 Runes

import type { PluginContext } from '$lib/types/plugin';

export interface LoreArticle {
  id: string;
  title: string;
  category: 'npc' | 'location' | 'faction' | 'item' | 'handout';
  contentMd: string;
  imageUrl?: string;
  isSecret: boolean;
  updatedAt: number;
}

const STORAGE_KEY = 'vtt_plugin_lore_wiki';

/**
 * Pure regex-based parser extracting [[wikilink]] references from markdown text.
 */
export function extractWikiLinks(
  markdown: string,
  sourceTitle?: string
): { nodes: string[]; edges: Array<[string, string]> } {
  const nodesSet = new Set<string>();
  const edges: Array<[string, string]> = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    // Handle display aliases [[Target|Alias]]
    const target = raw.split('|')[0].trim();
    if (target) {
      nodesSet.add(target);
      if (sourceTitle) {
        edges.push([sourceTitle, target]);
      }
    }
  }

  return { nodes: Array.from(nodesSet), edges };
}

/**
 * Pushes theatrical parchment popups to the TV display or a targeted player screen.
 */
export function castHandout(
  context: PluginContext,
  article: LoreArticle,
  targetPlayerId?: string
): void {
  context.emit(
    'HANDOUT_CAST',
    {
      title: article.title,
      contentMd: article.contentMd,
      imageUrl: article.imageUrl,
      targetPlayerId
    },
    true
  );
}

export class LoreEngine {
  articles = $state<LoreArticle[]>([]);
  activeArticleId = $state<string | null>(null);

  constructor() {
    this.loadFromStorage();
  }

  loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.articles = parsed;
          if (this.articles.length > 0 && !this.activeArticleId) {
            this.activeArticleId = this.articles[0].id;
          }
        }
      }
    } catch {
      // safe fallback on parse error
    }
  }

  saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.articles));
    } catch {
      // safe fallback on quota error
    }
  }

  getArticle(id: string): LoreArticle | undefined {
    return this.articles.find((a) => a.id === id);
  }

  getArticleByTitle(title: string): LoreArticle | undefined {
    const lower = title.toLowerCase();
    return this.articles.find((a) => a.title.toLowerCase() === lower);
  }

  addArticle(article: Omit<LoreArticle, 'id' | 'updatedAt'> & { id?: string }): LoreArticle {
    const newArticle: LoreArticle = {
      id: article.id || `lore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: article.title,
      category: article.category,
      contentMd: article.contentMd,
      imageUrl: article.imageUrl,
      isSecret: article.isSecret,
      updatedAt: Date.now()
    };

    this.articles.push(newArticle);
    this.activeArticleId = newArticle.id;
    this.saveToStorage();
    return newArticle;
  }

  updateArticle(id: string, updates: Partial<Omit<LoreArticle, 'id'>>): void {
    const article = this.getArticle(id);
    if (!article) return;

    Object.assign(article, updates);
    article.updatedAt = Date.now();
    this.saveToStorage();
  }

  deleteArticle(id: string): void {
    const idx = this.articles.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.articles.splice(idx, 1);
      if (this.activeArticleId === id) {
        this.activeArticleId = this.articles[0]?.id || null;
      }
      this.saveToStorage();
    }
  }

  /**
   * Generates a bidirectional relationship graph across all managed articles.
   */
  getRelationshipGraph(): { nodes: string[]; edges: Array<[string, string]> } {
    const nodeSet = new Set<string>();
    const allEdges: Array<[string, string]> = [];

    for (const article of this.articles) {
      nodeSet.add(article.title);
      const { nodes, edges } = extractWikiLinks(article.contentMd, article.title);
      for (const n of nodes) nodeSet.add(n);
      for (const e of edges) allEdges.push(e);
    }

    return {
      nodes: Array.from(nodeSet),
      edges: allEdges
    };
  }

  /**
   * Returns all articles that link to the specified title.
   */
  getBacklinks(title: string): LoreArticle[] {
    const lower = title.toLowerCase();
    return this.articles.filter((article) => {
      const { nodes } = extractWikiLinks(article.contentMd);
      return nodes.some((target) => target.toLowerCase() === lower);
    });
  }

  castHandout(context: PluginContext, article: LoreArticle, targetPlayerId?: string): void {
    castHandout(context, article, targetPlayerId);
  }
}

export const loreEngine = new LoreEngine();
