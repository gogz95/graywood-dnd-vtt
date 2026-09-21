// src/lib/stores/automationSettings.svelte.ts
// Hybrid Automation vs. Physical Table Dice Store (Requirements 9 & 11)

export interface AutomationConfig {
  globalRollMode: 'digital' | 'manual_prompt';
  autoRollInitiative: boolean;
  autoRollDeathSaves: boolean;
  autoRollConcentration: boolean;
  autoRollHitDice: boolean;
  autoRollAttacks: boolean;
  autoRollDamage: boolean;
}

const STORAGE_KEY = 'vtt_automation_config';

const DEFAULT_CONFIG: AutomationConfig = {
  globalRollMode: 'digital',
  autoRollInitiative: true,
  autoRollDeathSaves: true,
  autoRollConcentration: true,
  autoRollHitDice: true,
  autoRollAttacks: true,
  autoRollDamage: true,
};

function loadStoredConfig(): AutomationConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_CONFIG;
}

class AutomationSettingsStore {
  config = $state<AutomationConfig>(loadStoredConfig());

  constructor() {
    if (typeof window !== 'undefined') {
      $effect.root(() => {
        $effect(() => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
          } catch {
            // ignore
          }
        });
      });
    }
  }

  setGlobalMode(mode: 'digital' | 'manual_prompt') {
    this.config.globalRollMode = mode;
  }

  toggleCheck(key: keyof Omit<AutomationConfig, 'globalRollMode'>) {
    this.config[key] = !this.config[key];
  }

  setCheck(key: keyof Omit<AutomationConfig, 'globalRollMode'>, value: boolean) {
    this.config[key] = value;
  }

  /**
   * Evaluates if a given mechanical check should auto-roll or prompt for physical dice.
   * If globalRollMode is 'manual_prompt', prompts manually unless check is explicitly bypassed.
   */
  shouldAutoRoll(checkType: keyof Omit<AutomationConfig, 'globalRollMode'>): boolean {
    if (this.config.globalRollMode === 'manual_prompt') {
      return false;
    }
    return this.config[checkType] ?? true;
  }

  resetToDefaults() {
    this.config = { ...DEFAULT_CONFIG };
  }
}

export const automationSettings = new AutomationSettingsStore();
