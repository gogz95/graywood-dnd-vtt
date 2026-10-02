// frontend/src/lib/stores/tableStore.svelte.ts
// Svelte 5 Rune-based Rollable Table Store and Source Viewer bridge.

import { parseDiceFormula } from '../services/diceEngine';
import { chatLogService, type RollableTable, type TableEntry, type TableProvenance } from '../services/chatLogService';

export interface SourceViewerRequest {
  isOpen: boolean;
  sourceFileRel: string;
  pageNumber: number;
  highlightBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class TableStore {
  tables = $state<RollableTable[]>([]);
  selectedTable = $state<RollableTable | null>(null);
  isDrawerOpen = $state<boolean>(false);
  isLoading = $state<boolean>(false);
  sourceViewer = $state<SourceViewerRequest>({
    isOpen: false,
    sourceFileRel: '',
    pageNumber: 1,
  });

  constructor() {
    this.loadTables();
  }

  async loadTables(): Promise<void> {
    this.isLoading = true;
    try {
      if (typeof window !== 'undefined') {
        const tauri = (window as unknown as {
          __TAURI__?: {
            core?: {
              invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
            };
          };
        }).__TAURI__;

        if (tauri?.core?.invoke) {
          const loaded = await tauri.core.invoke<RollableTable[]>('get_rollable_tables_cmd');
          if (loaded) {
            this.tables = loaded;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load rollable tables via IPC:', err);
    } finally {
      this.isLoading = false;
    }
  }

  async syncWorkspaceTables(): Promise<void> {
    this.isLoading = true;
    try {
      if (typeof window !== 'undefined') {
        const tauri = (window as unknown as {
          __TAURI__?: {
            core?: {
              invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
            };
          };
        }).__TAURI__;

        if (tauri?.core?.invoke) {
          const synced = await tauri.core.invoke<RollableTable[]>('sync_workspace_tables_cmd');
          if (synced) {
            this.tables = synced;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync workspace tables:', err);
    } finally {
      this.isLoading = false;
    }
  }

  rollTable(table: RollableTable): TableEntry | null {
    if (!table.entries || table.entries.length === 0) {
      return null;
    }

    const formula = table.formula || '1d20';
    const rollResult = parseDiceFormula(formula);
    const rollTotal = rollResult.total;

    let matchedEntry = table.entries.find(
      (e) => rollTotal >= e.range[0] && rollTotal <= e.range[1]
    );

    if (!matchedEntry) {
      if (rollTotal < table.entries[0].range[0]) {
        matchedEntry = table.entries[0];
      } else {
        matchedEntry = table.entries[table.entries.length - 1];
      }
    }

    if (matchedEntry) {
      chatLogService.postTableRollCard(table, rollTotal, matchedEntry);
    }

    return matchedEntry || null;
  }

  openDrawer(tableId?: string): void {
    if (tableId) {
      const found = this.tables.find((t) => t.id === tableId);
      if (found) this.selectedTable = found;
    }
    this.isDrawerOpen = true;
  }

  closeDrawer(): void {
    this.isDrawerOpen = false;
  }

  openSourceViewer(sourceFileRel: string, pageNumber: number, highlightBox?: SourceViewerRequest['highlightBox']): void {
    this.sourceViewer = {
      isOpen: true,
      sourceFileRel,
      pageNumber: Math.max(1, pageNumber),
      highlightBox,
    };
  }

  closeSourceViewer(): void {
    this.sourceViewer = {
      ...this.sourceViewer,
      isOpen: false,
    };
  }
}

export const tableStore = new TableStore();
