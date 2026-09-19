// archivistStore.svelte.ts — Reactive Rules Archivist RAG Store
// Connects grounded IndexedDB chunks from documentImporter directly to Ollama LLM queries

import { searchChunks, type TextChunk } from '../importers/documentImporter';

export interface ArchivistMessage {
  id: string;
  sender: 'user' | 'archivist';
  text: string;
  timestamp: number;
  citations?: string[];
  isLoading?: boolean;
}

const STORAGE_CHAT_KEY = 'vtt_archivist_chat';
const STORAGE_MODEL_KEY = 'vtt_archivist_model';
const STORAGE_TEMP_KEY = 'vtt_archivist_temp';
const STORAGE_OLLAMA_KEY = 'vtt_ollama_base_url';

class ArchivistStore {
  messages = $state<ArchivistMessage[]>(this.loadMessages());
  isGenerating = $state(false);
  model = $state(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_MODEL_KEY) || 'qwen2.5:7b' : 'qwen2.5:7b');
  temperature = $state(typeof localStorage !== 'undefined' ? Number(localStorage.getItem(STORAGE_TEMP_KEY) || '0.1') : 0.1);
  ollamaBaseUrl = $state(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_OLLAMA_KEY) || 'http://localhost:11434' : 'http://localhost:11434');

  private abortCtrl: AbortController | null = null;

  private loadMessages(): ArchivistMessage[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_CHAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ArchivistMessage[];
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'arch-init',
        sender: 'archivist',
        text: 'Rules Archivist online. Ask any D&D 5e / 5.5e (2024) SRD question. Ingest rulebooks in the Knowledge Base to provide grounded page citations.',
        timestamp: Date.now(),
      }
    ];
  }

  private saveMessages() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(this.messages.filter(m => !m.isLoading).slice(-60)));
      localStorage.setItem(STORAGE_MODEL_KEY, this.model);
      localStorage.setItem(STORAGE_TEMP_KEY, String(this.temperature));
    } catch {
      // ignore
    }
  }

  async askQuestion(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || this.isGenerating) return;

    const userMsg: ArchivistMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const pendingMsg: ArchivistMessage = {
      id: `arch-${Date.now()}`,
      sender: 'archivist',
      text: '',
      timestamp: Date.now(),
      isLoading: true,
      citations: [],
    };

    this.messages = [...this.messages, userMsg, pendingMsg];
    this.isGenerating = true;
    this.saveMessages();

    // 1. RAG Retrieval: fetch grounded chunks
    let relevantChunks: TextChunk[] = [];
    try {
      relevantChunks = await searchChunks(trimmed, 4);
    } catch (err) {
      console.warn('RAG search error:', err);
    }

    const citations = relevantChunks.map(c => `[${c.documentTitle}: ${c.headerPath}]`);

    // Build context block
    let contextBlock = '';
    if (relevantChunks.length > 0) {
      contextBlock = '\n\nGROUNDED SOURCE CONTEXT:\n' + relevantChunks.map(c =>
        `### Source: ${c.documentTitle} > ${c.headerPath}\n${c.content}`
      ).join('\n\n');
    }

    const systemPrompt = `You are the Rules Archivist, an expert referee for D&D 5th Edition and 5.5e (2024 SRD).
Answer rules questions precisely, concisely, and impartially.
Cite specific actions, spell slots, saving throws, conditions, or rules sections where applicable.
${contextBlock ? `Refer to the provided Grounded Source Context where relevant.\n${contextBlock}` : ''}`;

    this.abortCtrl = new AbortController();

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.abortCtrl.signal,
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\nUser Question: ${trimmed}\n\nArchivist Answer:`,
          stream: false,
          options: {
            temperature: this.temperature,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const answerText = data.response || 'No response generated.';

      this.messages = this.messages.map(m => m.id === pendingMsg.id ? {
        ...m,
        text: answerText,
        isLoading: false,
        citations,
      } : m);
    } catch (err: unknown) {
      const isAborted = err instanceof Error && err.name === 'AbortError';
      if (isAborted) {
        this.messages = this.messages.filter(m => m.id !== pendingMsg.id);
      } else {
        // High-quality offline grounded fallback
        let fallbackAnswer = '';
        if (relevantChunks.length > 0) {
          fallbackAnswer = `**[Offline SRD Reference]** According to knowledge records:\n\n` +
            relevantChunks.map(c => `**${c.headerPath}**:\n${c.content}`).join('\n\n');
        } else {
          fallbackAnswer = `*(Local Ollama instance not connected at ${this.ollamaBaseUrl})*\n\n` +
            `To enable live AI answers, ensure Ollama is running (\`ollama run ${this.model}\`) or ingest rules documents into the Knowledge Base for grounded offline lookups.`;
        }

        this.messages = this.messages.map(m => m.id === pendingMsg.id ? {
          ...m,
          text: fallbackAnswer,
          isLoading: false,
          citations,
        } : m);
      }
    } finally {
      this.isGenerating = false;
      this.abortCtrl = null;
      this.saveMessages();
    }
  }

  abort(): void {
    if (this.abortCtrl) {
      this.abortCtrl.abort();
      this.abortCtrl = null;
    }
    this.isGenerating = false;
  }

  clearChat(): void {
    this.messages = [
      {
        id: 'arch-init',
        sender: 'archivist',
        text: 'Rules Archivist online. Ask any D&D 5e / 5.5e (2024) SRD question.',
        timestamp: Date.now(),
      }
    ];
    this.saveMessages();
  }
}

export const archivistStore = new ArchivistStore();
