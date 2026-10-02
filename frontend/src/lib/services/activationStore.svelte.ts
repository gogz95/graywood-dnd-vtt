// frontend/src/lib/services/activationStore.svelte.ts
// Svelte 5 Rune-based Compendium Activation & Streaming Compiler Store

import { dexieDb, type ActivatedActor } from '../db/dexieDb';

export interface CompilerProgressEvent {
  filename: string;
  current_page: number;
  total_pages: number;
  entity_name: string | null;
  is_activated: boolean;
  token_generated: boolean;
}

export interface CompilePdfResult {
  file_rel_path: string;
  total_pages: number;
  activated_count: number;
  entities: ActivatedActor[];
}

export class ActivationStore {
  activatedActors = $state<ActivatedActor[]>([]);
  isCompiling = $state<boolean>(false);
  compilerProgress = $state<CompilerProgressEvent | null>(null);
  lastResult = $state<CompilePdfResult | null>(null);
  errorMessage = $state<string | null>(null);

  constructor() {
    this.loadActivatedActors();
  }

  async loadActivatedActors(): Promise<ActivatedActor[]> {
    try {
      const records = await dexieDb.actors.toArray();
      this.activatedActors = records;
      return records;
    } catch (err) {
      console.warn('Failed to load activated actors from Dexie:', err);
      return [];
    }
  }

  async getActor(id: string): Promise<ActivatedActor | undefined> {
    const memoryHit = this.activatedActors.find((a) => a.id === id);
    if (memoryHit) return memoryHit;

    try {
      return await dexieDb.actors.get(id);
    } catch {
      return undefined;
    }
  }

  async compileSourcebookPdf(fileRelPath: string): Promise<CompilePdfResult> {
    this.isCompiling = true;
    this.errorMessage = null;
    this.compilerProgress = null;

    let unlisten: (() => void) | null = null;

    try {
      if (typeof window !== 'undefined') {
        const tauri = (window as unknown as {
          __TAURI__?: {
            event?: {
              listen: <T>(event: string, handler: (e: { payload: T }) => void) => Promise<() => void>;
            };
            core?: {
              invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
            };
          };
        }).__TAURI__;

        if (tauri?.event?.listen) {
          unlisten = await tauri.event.listen<CompilerProgressEvent>(
            'compiler-progress',
            (event) => {
              this.compilerProgress = event.payload;
            }
          );
        }

        if (tauri?.core?.invoke) {
          const result = await tauri.core.invoke<CompilePdfResult>(
            'compile_sourcebook_pdf',
            { fileRelPath }
          );

          if (result && result.entities && result.entities.length > 0) {
            const recordsToStore: ActivatedActor[] = result.entities.map((e) => ({
              ...e,
              is_activated: 1,
              updated_at: Date.now(),
            }));

            await dexieDb.actors.bulkPut(recordsToStore);
            await this.loadActivatedActors();
          }

          this.lastResult = result;
          return result;
        }
      }

      throw new Error('Tauri IPC runtime unavailable for PDF compilation');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage = msg;
      throw err;
    } finally {
      this.isCompiling = false;
      if (unlisten) {
        unlisten();
      }
    }
  }

  async clearActivatedActors(): Promise<void> {
    await dexieDb.actors.clear();
    this.activatedActors = [];
  }
}

export const activationStore = new ActivationStore();
