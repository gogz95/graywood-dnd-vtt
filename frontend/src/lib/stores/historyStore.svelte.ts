// frontend/src/lib/stores/historyStore.svelte.ts
// Deterministic Combat & Tactical Action Undo/Redo Time Machine

import { sendWsEvent } from '../../stores/websocketStore';

export interface GameActionCommand {
  id: string;
  label: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
  revertedStatePayload?: unknown;
}

export class HistoryStore {
  undoStack = $state<GameActionCommand[]>([]);
  redoStack = $state<GameActionCommand[]>([]);
  readonly maxHistory = 50;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachKeyboardListener();
    }
  }

  public recordAction(cmd: GameActionCommand): void {
    this.undoStack = [cmd, ...this.undoStack].slice(0, this.maxHistory);
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const [cmd, ...rest] = this.undoStack;
    this.undoStack = rest;

    try {
      cmd.undo();
      this.redoStack = [cmd, ...this.redoStack].slice(0, this.maxHistory);

      sendWsEvent('HISTORY_UNDO', {
        actionId: cmd.id,
        label: cmd.label,
        timestamp: Date.now(),
        payload: cmd.revertedStatePayload
      });
      return true;
    } catch (err) {
      console.error(`[HistoryStore] Failed to undo "${cmd.label}":`, err);
      return false;
    }
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const [cmd, ...rest] = this.redoStack;
    this.redoStack = rest;

    try {
      cmd.redo();
      this.undoStack = [cmd, ...this.undoStack].slice(0, this.maxHistory);

      sendWsEvent('HISTORY_REDO', {
        actionId: cmd.id,
        label: cmd.label,
        timestamp: Date.now()
      });
      return true;
    } catch (err) {
      console.error(`[HistoryStore] Failed to redo "${cmd.label}":`, err);
      return false;
    }
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public attachKeyboardListener(): () => void {
    if (typeof window === 'undefined' || this.isListening) return () => {};
    this.isListening = true;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when actively typing in text fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Check if on DM Controller view (not on spectator display)
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      if (path.startsWith('/display') || search.includes('mode=display')) {
        return;
      }

      const isMac =
        typeof navigator !== 'undefined' &&
        navigator.platform?.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (!modifier) return;

      // Undo: Ctrl+Z or Cmd+Z (without Shift)
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      // Redo: Ctrl+Y or Cmd+Shift+Z or Ctrl+Shift+Z
      else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      this.isListening = false;
    };
  }
}

export const historyStore = new HistoryStore();

export function recordAction(cmd: GameActionCommand): void {
  historyStore.recordAction(cmd);
}

export function undo(): boolean {
  return historyStore.undo();
}

export function redo(): boolean {
  return historyStore.redo();
}
