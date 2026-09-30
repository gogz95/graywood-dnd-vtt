// frontend/src/lib/tests/phase5Integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTypingInInput, keyboardShortcuts } from '../services/keyboardShortcuts';
import { macroStore } from '../stores/macroStore.svelte';

// Ensure minimal window & CustomEvent in node test environment
if (typeof globalThis.window === 'undefined') {
  const eventListeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (event: string, cb: Function) => {
      eventListeners[event] = eventListeners[event] || [];
      eventListeners[event].push(cb);
    },
    removeEventListener: (event: string, cb: Function) => {
      if (eventListeners[event]) {
        eventListeners[event] = eventListeners[event].filter(f => f !== cb);
      }
    },
    dispatchEvent: (event: any) => {
      const type = event.type;
      if (eventListeners[type]) {
        eventListeners[type].forEach(cb => cb(event));
      }
      return true;
    }
  };

  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: any) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

function createMockElement(tag: string, contentEditable = false, role?: string, parent?: any) {
  return {
    tagName: tag.toUpperCase(),
    isContentEditable: contentEditable,
    parentElement: parent,
    closest(selector: string) {
      if (role && selector.includes(`role="${role}"`)) return this;
      if (contentEditable && selector.includes('contenteditable="true"')) return this;
      if (parent && parent.closest) return parent.closest(selector);
      return null;
    }
  } as unknown as HTMLElement;
}

describe('Phase 5 Polish: Keyboard Shortcuts & Input Guarding', () => {
  it('correctly detects interactive input elements and contenteditables', () => {
    const inputEl = createMockElement('input');
    const textareaEl = createMockElement('textarea');
    const selectEl = createMockElement('select');
    const editableDiv = createMockElement('div', true);

    const normalDiv = createMockElement('div');
    const buttonEl = createMockElement('button');

    expect(isTypingInInput(inputEl)).toBe(true);
    expect(isTypingInInput(textareaEl)).toBe(true);
    expect(isTypingInInput(selectEl)).toBe(true);
    expect(isTypingInInput(editableDiv)).toBe(true);

    expect(isTypingInInput(normalDiv)).toBe(false);
    expect(isTypingInInput(buttonEl)).toBe(false);
    expect(isTypingInInput(null)).toBe(false);
  });

  it('detects nested editable elements via closest selector', () => {
    const parentBox = createMockElement('div', false, 'textbox');
    const childSpan = createMockElement('span', false, undefined, parentBox);

    expect(isTypingInInput(childSpan)).toBe(true);
  });

  it('notifies subscribers and executes macro when slot is triggered', () => {
    const callback = vi.fn();
    const unsubscribe = keyboardShortcuts.subscribeSlotTrigger(callback);

    keyboardShortcuts.triggerSlot(0, 'hotkey');
    expect(callback).toHaveBeenCalledWith(0, 'hotkey');

    keyboardShortcuts.triggerSlot(4, 'click');
    expect(callback).toHaveBeenCalledWith(4, 'click');

    unsubscribe();
  });
});

describe('Phase 5 Polish: Macro Store Defaults & Action Commands', () => {
  beforeEach(() => {
    macroStore.loadSlots();
  });

  it('initializes 9 default macro action slots with expected keybindings', () => {
    expect(macroStore.slots).toHaveLength(9);
    const slot1 = macroStore.slots[0];
    const slot2 = macroStore.slots[1];
    const slot3 = macroStore.slots[2];
    const slot4 = macroStore.slots[3];
    const slot5 = macroStore.slots[4];

    expect(slot1).not.toBeNull();
    expect(slot1?.keybinding).toBe('1');
    expect(slot1?.name).toBe('Weapon Strike');

    expect(slot2).not.toBeNull();
    expect(slot2?.keybinding).toBe('2');
    expect(slot2?.command).toContain('/spell');

    expect(slot3?.name).toBe('Dodge / Dash');
    expect(slot4?.command).toBe('/fog');
    expect(slot5?.command).toBe('/ping');
  });

  it('updates and clears macro slots cleanly', () => {
    const custom = {
      id: 'custom-m',
      name: 'Custom Fireball',
      icon: '🔥',
      command: '/roll 8d6',
      keybinding: '1',
    };

    macroStore.setSlot(0, custom);
    expect(macroStore.slots[0]?.name).toBe('Custom Fireball');

    macroStore.clearSlot(0);
    expect(macroStore.slots[0]).toBeNull();

    // Restore slot 1
    macroStore.setSlot(0, {
      id: 'm1',
      name: 'Weapon Strike',
      icon: '⚔️',
      command: '/roll 1d20 + @selected.str',
      keybinding: '1',
    });
  });

  it('dispatches custom events on /fog and /ping macro commands', () => {
    const fogSpy = vi.fn();
    const pingSpy = vi.fn();

    window.addEventListener('vtt:toggle-fog-tool', fogSpy);
    window.addEventListener('vtt:trigger-ping', pingSpy);

    macroStore.executeMacro(3); // Fog Brush
    expect(fogSpy).toHaveBeenCalled();

    macroStore.executeMacro(4); // Ping Tool
    expect(pingSpy).toHaveBeenCalled();

    window.removeEventListener('vtt:toggle-fog-tool', fogSpy);
    window.removeEventListener('vtt:trigger-ping', pingSpy);
  });
});
