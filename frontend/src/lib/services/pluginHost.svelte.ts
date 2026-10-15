import type {
  PluginContext,
  PluginInstance,
  PluginSlot,
  PluginSlotBinding,
  VttPlugin
} from '$lib/types/plugin';
import type { ViewportProvider } from '$lib/types/viewport';
import { sendWsEvent } from '../../stores/websocketStore';
import { tokenStore } from '$lib/stores/tokenStore.svelte';
import { mapStore } from '$lib/stores/mapStore.svelte';

const STORAGE_KEY = 'vtt_enabled_plugins';

export interface ActiveSlotBinding {
  pluginId: string;
  title: string;
  icon: string;
  mount: (container: HTMLElement, context: PluginContext) => PluginInstance | void;
}

export class PluginRegistry {
  registeredPlugins = $state<Map<string, VttPlugin>>(new Map());
  enabledIds = $state<Set<string>>(new Set());
  viewportProviders = $state<Map<string, ViewportProvider>>(new Map());

  private persistedIds: Set<string> | null = null;
  private listeners = new Map<string, Set<(payload: any) => void>>();
  private blackboard = new Map<string, Record<string, any>>();

  constructor() {
    this.loadPersistedState();
    if (typeof window !== 'undefined') {
      window.addEventListener('vtt:plugin-event', (ev: any) => {
        const detail = ev.detail;
        if (detail && detail.event) {
          this.emit(detail.event, detail.payload, false);
        }
      });
    }
  }

  private loadPersistedState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.persistedIds = new Set(parsed);
          this.enabledIds = new Set(parsed);
        }
      }
    } catch {
      this.persistedIds = null;
    }
  }

  private savePersistedState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.enabledIds)));
    } catch {
      // Ignore storage errors
    }
  }

  // ── Viewport Provider Registry ──────────────────────────────────────────

  registerViewport(provider: ViewportProvider): void {
    const nextMap = new Map(this.viewportProviders);
    nextMap.set(provider.id, provider);
    this.viewportProviders = nextMap;
  }

  getViewportForScene(sceneType: string): ViewportProvider | undefined {
    for (const provider of this.viewportProviders.values()) {
      if (provider.supportedSceneTypes.includes(sceneType)) {
        return provider;
      }
    }
    return undefined;
  }

  // ── Pub/Sub Event Message Bus ───────────────────────────────────────────

  on<T = unknown>(event: string, handler: (payload: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as (payload: any) => void);
    return () => {
      set.delete(handler as (payload: any) => void);
    };
  }

  emit<T = unknown>(event: string, payload: T, broadcastLan = false): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[PluginRegistry] Error handling event "${event}":`, err);
        }
      }
    }
    if (broadcastLan) {
      sendWsEvent('PLUGIN_EVENT', { event, payload });
    }
  }

  // ── Entity Blackboard API ────────────────────────────────────────────────

  getMeta<T = unknown>(
    entityType: 'token' | 'actor' | 'scene',
    entityId: string,
    pluginId: string
  ): T | undefined {
    if (entityType === 'token') {
      const token = tokenStore.get(entityId);
      if (token?.metadata && pluginId in token.metadata) {
        return token.metadata[pluginId] as T;
      }
    }
    const key = `${entityType}:${entityId}`;
    return this.blackboard.get(key)?.[pluginId] as T | undefined;
  }

  setMeta<T = unknown>(
    entityType: 'token' | 'actor' | 'scene',
    entityId: string,
    pluginId: string,
    value: T,
    ephemeral = false
  ): void {
    const key = `${entityType}:${entityId}`;
    if (!this.blackboard.has(key)) {
      this.blackboard.set(key, {});
    }
    this.blackboard.get(key)![pluginId] = value;

    if (entityType === 'token') {
      const token = tokenStore.get(entityId);
      if (token) {
        if (!token.metadata) {
          token.metadata = {};
        }
        token.metadata[pluginId] = value;
        tokenStore.updateTokenLocally(entityId, { metadata: token.metadata });
      }
    }

    sendWsEvent(
      'META_PATCH',
      { entityType, entityId, pluginId, value },
      ephemeral
    );
  }

  hasCapability(pluginId: string): boolean {
    return this.isEnabled(pluginId) || this.registeredPlugins.has(pluginId);
  }

  // ── Context Factory ──────────────────────────────────────────────────────

  createContext(pluginId: string): PluginContext {
    return {
      activeSceneId: () => mapStore.activeMapId || null,
      activeTurnActorId: () => null,
      rollDice: (formula: string, label?: string) => {
        sendWsEvent('DICE_ROLL', { formula, label });
      },
      sendWsEvent: (type: string, payload: unknown, ephemeral = false) => {
        sendWsEvent(type, payload, ephemeral);
      },
      on: <T = unknown>(event: string, handler: (payload: T) => void) => {
        return this.on(event, handler);
      },
      emit: <T = unknown>(event: string, payload: T, broadcastLan = false) => {
        this.emit(event, payload, broadcastLan);
      },
      getMeta: <T = unknown>(
        entityType: 'token' | 'actor' | 'scene',
        entityId: string,
        metaPluginId: string = pluginId
      ) => {
        return this.getMeta<T>(entityType, entityId, metaPluginId);
      },
      setMeta: <T = unknown>(
        entityType: 'token' | 'actor' | 'scene',
        entityId: string,
        metaPluginId: string = pluginId,
        value: T,
        ephemeral = false
      ) => {
        this.setMeta<T>(entityType, entityId, metaPluginId, value, ephemeral);
      },
      hasCapability: (capPluginId: string) => {
        return this.hasCapability(capPluginId);
      }
    };
  }

  // ── Plugin Lifecycle ─────────────────────────────────────────────────────

  register(plugin: VttPlugin): void {
    const nextMap = new Map(this.registeredPlugins);
    nextMap.set(plugin.id, plugin);
    this.registeredPlugins = nextMap;

    let shouldEnable = false;
    if (this.persistedIds !== null) {
      shouldEnable = this.persistedIds.has(plugin.id);
    } else {
      shouldEnable = plugin.enabledByDefault ?? false;
    }

    if (shouldEnable && !this.enabledIds.has(plugin.id)) {
      void this.enable(plugin.id);
    }
  }

  async enable(id: string): Promise<void> {
    const plugin = this.registeredPlugins.get(id);
    if (!plugin) return;

    if (!this.enabledIds.has(id)) {
      const nextSet = new Set(this.enabledIds);
      nextSet.add(id);
      this.enabledIds = nextSet;
      this.savePersistedState();

      if (plugin.onInit) {
        await plugin.onInit(this.createContext(plugin.id));
      }
    }
  }

  disable(id: string): void {
    const plugin = this.registeredPlugins.get(id);
    if (!plugin) return;

    if (this.enabledIds.has(id)) {
      const nextSet = new Set(this.enabledIds);
      nextSet.delete(id);
      this.enabledIds = nextSet;
      this.savePersistedState();

      if (plugin.onDestroy) {
        plugin.onDestroy();
      }
    }
  }

  isEnabled(id: string): boolean {
    return this.enabledIds.has(id);
  }

  getSlotBindings(slot: PluginSlot): ActiveSlotBinding[] {
    const bindings: ActiveSlotBinding[] = [];

    for (const pluginId of this.enabledIds) {
      const plugin = this.registeredPlugins.get(pluginId);
      if (!plugin) continue;

      for (const slotBinding of plugin.slots) {
        if (slotBinding.slot === slot) {
          bindings.push({
            pluginId: plugin.id,
            title: slotBinding.title,
            icon: slotBinding.icon,
            mount: (container: HTMLElement) =>
              slotBinding.mount(container, this.createContext(plugin.id))
          });
        }
      }
    }

    return bindings;
  }

  // ── Dynamic External Plugin Runtime Sideloading ──────────────────────────

  async loadExternalPlugins(): Promise<void> {
    try {
      const res = await fetch('/api/plugins/external');
      if (!res.ok) return;
      const manifests: Array<{ id: string; scriptUrl?: string; script_url?: string }> =
        await res.json();

      for (const manifest of manifests) {
        const url = manifest.scriptUrl || manifest.script_url;
        if (!url) continue;

        try {
          const mod = await import(/* @vite-ignore */ url);
          const plugin: VttPlugin = mod.default || mod.plugin || mod;
          if (plugin && plugin.id) {
            this.register(plugin);
          }
        } catch (err) {
          console.warn(`[pluginHost] Failed dynamically importing ${url}:`, err);
        }
      }
    } catch (err) {
      console.warn('[pluginHost] Failed fetching external plugin manifests:', err);
    }
  }

  async sideloadZip(file: File): Promise<VttPlugin> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/plugins/sideload', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sideload failed HTTP ${res.status}: ${errText}`);
    }

    const manifest = await res.json();
    const scriptUrl = manifest.scriptUrl || manifest.script_url;
    if (!scriptUrl) {
      throw new Error('Server returned invalid plugin manifest without scriptUrl.');
    }

    const versionedUrl = `${scriptUrl}?t=${Date.now()}`;
    const mod = await import(/* @vite-ignore */ versionedUrl);
    const plugin: VttPlugin = mod.default || mod.plugin || mod;

    if (!plugin || !plugin.id) {
      throw new Error('Imported module does not export a valid VttPlugin.');
    }

    this.register(plugin);
    await this.enable(plugin.id);
    return plugin;
  }
}

export const pluginHost = new PluginRegistry();
