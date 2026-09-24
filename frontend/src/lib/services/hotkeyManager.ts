// frontend/src/lib/services/hotkeyManager.ts
// Global Keyboard Shortcut Manager for Graywood VTT DM Workstation

export type HotkeyHandler = (e: KeyboardEvent) => void;

interface RegisteredHotkey {
  id: string;
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: 'navigation' | 'canvas' | 'audio' | 'combat' | 'general';
  action: (e: KeyboardEvent) => void;
}

class HotkeyManager {
  private hotkeys: Map<string, RegisteredHotkey> = new Map();
  private isListening = false;

  register(hotkey: RegisteredHotkey) {
    this.hotkeys.set(hotkey.id, hotkey);
  }

  unregister(id: string) {
    this.hotkeys.delete(id);
  }

  getAll(): RegisteredHotkey[] {
    return Array.from(this.hotkeys.values());
  }

  init(): () => void {
    if (typeof window === 'undefined' || this.isListening) {
      return () => {};
    }

    const listener = (e: KeyboardEvent) => {
      // Don't intercept global shortcuts if user is typing in form controls, unless it's Escape or F1
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.key === 'F1' || (e.key === '?' && !isInput)) {
        const match = Array.from(this.hotkeys.values()).find(
          (h) => h.key.toLowerCase() === e.key.toLowerCase() || (e.key === '?' && h.key === '?')
        );
        if (match) {
          e.preventDefault();
          match.action(e);
          return;
        }
      }

      if (isInput) return;

      for (const hotkey of this.hotkeys.values()) {
        const matchesKey = e.key.toLowerCase() === hotkey.key.toLowerCase() || e.code === hotkey.key;
        const matchesCtrl = !!hotkey.ctrlOrMeta === (e.ctrlKey || e.metaKey);
        const matchesShift = !!hotkey.shift === e.shiftKey;
        const matchesAlt = !!hotkey.alt === e.altKey;

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          e.preventDefault();
          hotkey.action(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', listener);
    this.isListening = true;

    return () => {
      window.removeEventListener('keydown', listener);
      this.isListening = false;
    };
  }
}

export const hotkeyManager = new HotkeyManager();
