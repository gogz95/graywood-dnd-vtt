import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import SoundboardDrawer from '$lib/components/audio/SoundboardDrawer.svelte';
import {
  soundEngine,
  playTurnChime,
  playCritImpact,
  playDiceRoll
} from './services/soundEngine';

export { soundEngine, playTurnChime, playCritImpact, playDiceRoll };

let turnHandler: (() => void) | null = null;
let diceHandler: ((ev: Event) => void) | null = null;

export const soundboardPlugin: VttPlugin = {
  id: 'soundboard',
  name: 'Procedural Audio & Ambience',
  version: '1.0.0',
  description: 'Procedural Web Audio soundboard, turn chimes, and critical hit SFX',
  enabledByDefault: true,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Audio & SFX',
      icon: 'volume-2',
      mount(container: HTMLElement, _context: PluginContext) {
        const app = mount(SoundboardDrawer, {
          target: container,
          props: {
            isOpen: true,
            isMinimized: false
          }
        });
        return {
          destroy: () => {
            unmount(app);
          }
        };
      }
    }
  ],
  onInit(_context: PluginContext) {
    if (typeof window === 'undefined') return;

    turnHandler = () => {
      playTurnChime();
    };

    diceHandler = (ev: Event) => {
      const customEv = ev as CustomEvent<{ isCritical?: boolean }>;
      if (customEv.detail?.isCritical) {
        playCritImpact();
      }
    };

    window.addEventListener('COMBAT_TURN_CHANGED', turnHandler);
    window.addEventListener('vtt:combat-turn-changed', turnHandler);
    window.addEventListener('vtt:dice-roll', diceHandler);
    window.addEventListener('DICE_ROLL_CRIT', playCritImpact);
  },
  onDestroy() {
    if (typeof window === 'undefined') return;
    if (turnHandler) {
      window.removeEventListener('COMBAT_TURN_CHANGED', turnHandler);
      window.removeEventListener('vtt:combat-turn-changed', turnHandler);
      turnHandler = null;
    }
    if (diceHandler) {
      window.removeEventListener('vtt:dice-roll', diceHandler);
      diceHandler = null;
    }
    window.removeEventListener('DICE_ROLL_CRIT', playCritImpact);
  }
};
