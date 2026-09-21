// src/lib/stores/rulesEngine.svelte.ts
// Centralized, modular homebrew rules engine for 5e VTT Workstation
// All optional mechanics default to OFF (Strict 5e SRD Baseline)

export interface RuleModule {
  id: string;
  name: string;
  category: 'combat' | 'equipment' | 'calendar' | 'roster';
  description: string;
  enabled: boolean;
  source?: string;
}

const STORAGE_KEY = 'vtt_active_rules';
const BROADCAST_CHANNEL_NAME = 'vtt_ruleset_sync';

const CORE_MODULES: RuleModule[] = [
  {
    id: 'enableBlackOrbRoster',
    name: 'Temporal Black Orb Roster',
    category: 'roster',
    description: 'Off = neutral reserve terms ("Reserve Roster", "Move to Reserve"). On = "Temporal Black Orb" lore flavor and automatic CR party exclusion.',
    enabled: false
  },
  {
    id: 'enableDurabilitySystem',
    name: 'Resistance Points & Equipment Sunder',
    category: 'equipment',
    description: 'Off = standard 5e AC and weapon stats without Resistance Points (RP) or Sunder. On = active RP bars, sunder conditions, and repair DCs.',
    enabled: false
  },
  {
    id: 'enableTriStatInitiative',
    name: 'Tri-Stat / Mental Initiative',
    category: 'combat',
    description: 'Off = standard Dexterity modifier ("INIT: +X (DEX)"). On = alternative mental casting initiative scaling (WIS / INT / CHA).',
    enabled: false
  },
  {
    id: 'enableCustomCalendars',
    name: 'Fantasy & Decade Calendars',
    category: 'calendar',
    description: 'Off = standard 5e days, weeks, and months. On = custom campaign cycles including 10-day Decades and regional festival tides.',
    enabled: false
  }
];

class RulesEngine {
  modules = $state<RuleModule[]>([]);
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.initModules();
    this.initSync();
  }

  private initModules(): void {
    let saved: Record<string, { enabled: boolean; source?: string }> = {};
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch {
        saved = {};
      }
    }

    this.modules = CORE_MODULES.map(mod => ({
      ...mod,
      enabled: saved[mod.id]?.enabled ?? false,
      source: saved[mod.id]?.source
    }));
  }

  private initSync(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'BROADCAST_RULESET_UPDATE' && Array.isArray(event.data.modules)) {
            this.applyRemoteUpdate(event.data.modules);
          }
        };
      } catch {
        // Fallback for environments where BroadcastChannel is blocked
      }
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const map: Record<string, { enabled: boolean; source?: string }> = {};
      for (const m of this.modules) {
        map[m.id] = { enabled: m.enabled, source: m.source };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Non-blocking
    }
  }

  private broadcast(): void {
    const payload = {
      type: 'BROADCAST_RULESET_UPDATE',
      modules: $state.snapshot(this.modules),
      timestamp: Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch {
        // Ignored
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:ruleset-updated', { detail: payload }));
    }
  }

  private applyRemoteUpdate(remoteModules: RuleModule[]): void {
    const remoteMap = new Map(remoteModules.map(m => [m.id, m]));
    this.modules = this.modules.map(mod => {
      const remote = remoteMap.get(mod.id);
      return remote ? { ...mod, enabled: remote.enabled, source: remote.source } : mod;
    });
    this.persist();
  }

  isEnabled(id: string): boolean {
    const found = this.modules.find(m => m.id === id);
    return found ? found.enabled : false;
  }

  enableModule(id: string, source?: string): void {
    this.modules = this.modules.map(m =>
      m.id === id ? { ...m, enabled: true, source: source ?? m.source } : m
    );
    this.persist();
    this.broadcast();
  }

  disableModule(id: string): void {
    this.modules = this.modules.map(m =>
      m.id === id ? { ...m, enabled: false } : m
    );
    this.persist();
    this.broadcast();
  }

  setModuleEnabled(id: string, enabled: boolean, source?: string): void {
    if (enabled) {
      this.enableModule(id, source);
    } else {
      this.disableModule(id);
    }
  }

  toggleModule(id: string): void {
    this.modules = this.modules.map(m =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    );
    this.persist();
    this.broadcast();
  }

  resetToBaseline(): void {
    this.modules = this.modules.map(m => ({ ...m, enabled: false, source: undefined }));
    this.persist();
    this.broadcast();
  }

  exportManifest(): string {
    const manifest = {
      format: 'vtt_ruleset_manifest',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      modules: $state.snapshot(this.modules).map(m => ({
        id: m.id,
        name: m.name,
        category: m.category,
        enabled: m.enabled,
        source: m.source
      }))
    };
    return JSON.stringify(manifest, null, 2);
  }

  importManifest(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !Array.isArray(parsed.modules)) return false;

      const importMap = new Map<string, boolean>();
      for (const item of parsed.modules) {
        if (typeof item.id === 'string' && typeof item.enabled === 'boolean') {
          importMap.set(item.id, item.enabled);
        }
      }

      this.modules = this.modules.map(m => {
        if (importMap.has(m.id)) {
          return { ...m, enabled: importMap.get(m.id)! };
        }
        return m;
      });

      this.persist();
      this.broadcast();
      return true;
    } catch {
      return false;
    }
  }
}

export const rulesEngine = new RulesEngine();
