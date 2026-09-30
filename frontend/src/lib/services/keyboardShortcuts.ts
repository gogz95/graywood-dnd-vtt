// frontend/src/lib/services/keyboardShortcuts.ts
// Centralized Keyboard Shortcut & Macro Hotkey Manager with Strict Input Guarding

import { macroStore } from '../stores/macroStore.svelte';

export interface ShortcutListener {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

export type SlotTriggerCallback = (slotIdx: number, source: 'hotkey' | 'click') => void;

/**
 * Returns true if the event target is an interactive text input element
 * where hotkeys (like 1-9 or space) should be strictly suppressed.
 */
export function isTypingInInput(target: EventTarget | null): boolean {
  if (!target) return false;
  if (typeof HTMLElement !== 'undefined' && !(target instanceof HTMLElement)) return false;

  const el = target as HTMLElement;
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (el.isContentEditable) {
    return true;
  }

  // Check closest editable container or ARIA role
  if (
    typeof el.closest === 'function' &&
    (el.closest('[contenteditable="true"]') ||
      el.closest('[role="textbox"]') ||
      el.closest('[role="searchbox"]'))
  ) {
    return true;
  }

  return false;
}

class KeyboardShortcutManager {
  private customListeners: Map<string, ShortcutListener> = new Map();
  private slotSubscribers: Set<SlotTriggerCallback> = new Set();
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init(): void {
    if (this.isListening || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, { capture: false });
    this.isListening = true;
  }

  public destroy(): void {
    if (!this.isListening || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, { capture: false });
    this.isListening = false;
  }

  public subscribeSlotTrigger(cb: SlotTriggerCallback): () => void {
    this.slotSubscribers.add(cb);
    return () => this.slotSubscribers.delete(cb);
  }

  public registerShortcut(listener: ShortcutListener): () => void {
    this.customListeners.set(listener.id, listener);
    return () => this.customListeners.delete(listener.id);
  }

  public triggerSlot(slotIdx: number, source: 'hotkey' | 'click' = 'hotkey'): void {
    if (slotIdx < 0 || slotIdx >= 9) return;
    for (const cb of this.slotSubscribers) {
      cb(slotIdx, source);
    }
    macroStore.executeMacro(slotIdx);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // 1. Guard against firing when typing in an input/textarea/contenteditable
    if (isTypingInInput(e.target)) {
      return;
    }

    // 2. Number keys 1-9 for Macro Slots (ignore if modifier keys are pressed)
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      const keyNum = parseInt(e.key, 10);
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
        const slotIdx = keyNum - 1;
        this.triggerSlot(slotIdx, 'hotkey');
        return;
      }
    }

    // 3. Custom registered listeners
    for (const listener of this.customListeners.values()) {
      if (
        e.key.toLowerCase() === listener.key.toLowerCase() &&
        !!listener.ctrl === (e.ctrlKey || e.metaKey) &&
        !!listener.shift === e.shiftKey &&
        !!listener.alt === e.altKey
      ) {
        listener.handler(e);
        break;
      }
    }
  };
}

export const keyboardShortcuts = new KeyboardShortcutManager();
