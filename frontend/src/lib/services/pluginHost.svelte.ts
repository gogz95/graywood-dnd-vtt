// frontend/src/lib/services/pluginHost.ts
// Sandboxed Plugin Engine & Asynchronous PostMessage Bridge with Svelte 5 Store Integration

import { tokenStore } from '../stores/tokenStore.svelte';
import { audioEngine } from '../audio/AudioEngine';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entrypoint: string;
  permissions: string[];
  description?: string;
  author?: string;
}

export interface PluginErrorLog {
  timestamp: number;
  message: string;
  stack?: string;
}

export interface PluginInstance {
  manifest: PluginManifest;
  code: string;
  enabled: boolean;
  status: 'active' | 'disabled' | 'error';
  worker: Worker | null;
  errors: PluginErrorLog[];
  mutationCount: number;
  lastMutationReset: number;
}

const STORAGE_KEY = 'vtt_plugin_configs_v1';
const MAX_MUTATIONS_PER_SEC = 30;

class PluginHostService {
  plugins = $state<PluginInstance[]>([]);
  activePluginCount = $derived(this.plugins.filter((p) => p.status === 'active').length);

  private enabledConfig: Record<string, boolean> = this.loadConfig();

  constructor() {
    if (typeof window !== 'undefined') {
      // Wire up global listeners to forward into sandboxed plugins
      this.initGlobalListeners();
    }
  }

  // ── Discovery & Registry ───────────────────────────────────────────────────
  async discoverPlugins(): Promise<void> {
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) return;

      const discovered: Array<{
        manifest: PluginManifest;
        dir_name: string;
        code: string;
        folder_path: string;
      }> = await res.json();

      const updated: PluginInstance[] = [];

      for (const item of discovered) {
        const existing = this.plugins.find((p) => p.manifest.id === item.manifest.id);
        const shouldEnable = this.enabledConfig[item.manifest.id] ?? true;

        if (existing) {
          existing.code = item.code;
          existing.manifest = item.manifest;
          if (shouldEnable && existing.status !== 'active') {
            this.startSandbox(existing);
          }
          updated.push(existing);
        } else {
          const inst: PluginInstance = {
            manifest: item.manifest,
            code: item.code,
            enabled: shouldEnable,
            status: 'disabled',
            worker: null,
            errors: [],
            mutationCount: 0,
            lastMutationReset: Date.now(),
          };
          if (shouldEnable) {
            this.startSandbox(inst);
          }
          updated.push(inst);
        }
      }

      this.plugins = updated;
    } catch (err) {
      console.warn('[PluginHost] Failed to discover plugins from /api/plugins:', err);
    }
  }

  // ── Sandboxed Web Worker Lifecycle ─────────────────────────────────────────
  private startSandbox(plugin: PluginInstance): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    if (plugin.worker) {
      plugin.worker.terminate();
      plugin.worker = null;
    }

    try {
      const workerScript = this.createWorkerBootstrap(plugin.code);
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);

      worker.onmessage = (e) => this.handleWorkerMessage(plugin, e.data);
      worker.onerror = (e) => {
        plugin.status = 'error';
        plugin.errors.push({
          timestamp: Date.now(),
          message: e.message || 'Unhandled worker error',
          stack: `${e.filename}:${e.lineno}:${e.colno}`,
        });
      };

      plugin.worker = worker;
      plugin.status = 'active';
      plugin.enabled = true;
      this.saveConfig();
    } catch (err: any) {
      plugin.status = 'error';
      plugin.errors.push({
        timestamp: Date.now(),
        message: err?.message || 'Failed to spawn worker sandbox',
        stack: err?.stack,
      });
    }
  }

  private stopSandbox(plugin: PluginInstance): void {
    if (plugin.worker) {
      plugin.worker.terminate();
      plugin.worker = null;
    }
    plugin.status = 'disabled';
    plugin.enabled = false;
    this.saveConfig();
  }

  togglePlugin(id: string): void {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (!plugin) return;

    if (plugin.status === 'active') {
      this.stopSandbox(plugin);
    } else {
      this.startSandbox(plugin);
    }
  }

  clearPluginErrors(id: string): void {
    const plugin = this.plugins.find((p) => p.manifest.id === id);
    if (plugin) {
      plugin.errors = [];
      if (plugin.status === 'error' && plugin.enabled) {
        this.startSandbox(plugin);
      }
    }
  }

  // ── Worker Message Handler, Rate-Limiting & Validation ─────────────────────
  private handleWorkerMessage(plugin: PluginInstance, msg: any): void {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ERROR') {
      plugin.errors.push({
        timestamp: Date.now(),
        message: msg.message || 'Worker runtime error',
        stack: msg.stack,
      });
      return;
    }

    if (msg.type === 'READY') {
      plugin.status = 'active';
      return;
    }

    if (msg.type === 'MUTATION') {
      const now = Date.now();
      if (now - plugin.lastMutationReset > 1000) {
        plugin.mutationCount = 0;
        plugin.lastMutationReset = now;
      }
      plugin.mutationCount++;

      // Strict Rate-Limiting Guard
      if (plugin.mutationCount > MAX_MUTATIONS_PER_SEC) {
        plugin.errors.push({
          timestamp: now,
          message: `Mutation throttled: Exceeded rate limit of ${MAX_MUTATIONS_PER_SEC} actions/sec.`,
        });
        return;
      }

      this.executeMutation(plugin, msg.action, msg.payload);
    }
  }

  private executeMutation(plugin: PluginInstance, action: string, payload: any): void {
    const perms = plugin.manifest.permissions || [];

    // 1. Tokens Mutate
    if (action === 'tokens:update') {
      if (!perms.includes('tokens:mutate')) {
        plugin.errors.push({
          timestamp: Date.now(),
          message: 'Permission denied: tokens:mutate required for api.tokens.update',
        });
        return;
      }

      const { tokenId, updates } = payload || {};
      if (typeof tokenId !== 'string' || !updates || typeof updates !== 'object') {
        plugin.errors.push({
          timestamp: Date.now(),
          message: 'Invalid payload for tokens:update: must provide string tokenId and object updates',
        });
        return;
      }

      // Sanitize safe subset of fields to prevent store corruption
      const sanitized: Record<string, any> = {};
      if (typeof updates.x === 'number' && !isNaN(updates.x)) sanitized.x = updates.x;
      if (typeof updates.y === 'number' && !isNaN(updates.y)) sanitized.y = updates.y;
      if (typeof updates.hp === 'number' && !isNaN(updates.hp)) sanitized.hp = Math.max(0, updates.hp);
      if (typeof updates.elevation === 'number' && !isNaN(updates.elevation)) sanitized.elevation = updates.elevation;
      if (typeof updates.rotation === 'number' && !isNaN(updates.rotation)) sanitized.rotation = updates.rotation;
      if (typeof updates.color === 'string') sanitized.color = updates.color.slice(0, 16);

      tokenStore.updateToken(tokenId, sanitized);
    }

    // 2. Notification Toast
    else if (action === 'notifications:toast') {
      const msg = typeof payload?.message === 'string' ? payload.message.slice(0, 200) : '';
      if (msg && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vtt:plugin-toast', {
            detail: { pluginName: plugin.manifest.name, message: msg },
          })
        );
      }
    }

    // 3. Audio Trigger
    else if (action === 'audio:trigger') {
      if (!perms.includes('audio:trigger')) {
        plugin.errors.push({
          timestamp: Date.now(),
          message: 'Permission denied: audio:trigger required for api.audio.trigger',
        });
        return;
      }
      const sfx = typeof payload?.sfxId === 'string' ? payload.sfxId : 'sfx-dice';
      audioEngine.triggerSfx(sfx);
    }
  }

  // ── Outbound Event Bridge ──────────────────────────────────────────────────
  broadcast(event: string, data: any): void {
    for (const plugin of this.plugins) {
      if (plugin.status === 'active' && plugin.worker) {
        plugin.worker.postMessage({ event, data });
      }
    }
  }

  // ── Global Event Integration ───────────────────────────────────────────────
  private initGlobalListeners(): void {
    // 1. Dice roll events
    window.addEventListener('vtt:dice-roll', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.broadcast('dice:roll', detail);
    });

    // 2. Turn change events
    window.addEventListener('vtt:turn-advanced', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      this.broadcast('turn:change', detail);
    });
  }

  // ── Isolated Zero-DOM Web Worker Wrapper ───────────────────────────────────
  private createWorkerBootstrap(userCode: string): string {
    return `
      // Sandboxed Zero-DOM Plugin Execution Wrapper
      (function() {
        const listeners = new Map();

        const api = {
          on(event, handler) {
            if (typeof event !== 'string' || typeof handler !== 'function') return;
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(handler);
          },
          tokens: {
            update(tokenId, updates) {
              self.postMessage({
                type: 'MUTATION',
                action: 'tokens:update',
                payload: { tokenId, updates }
              });
            }
          },
          notifications: {
            toast(message) {
              self.postMessage({
                type: 'MUTATION',
                action: 'notifications:toast',
                payload: { message }
              });
            }
          },
          audio: {
            trigger(sfxId) {
              self.postMessage({
                type: 'MUTATION',
                action: 'audio:trigger',
                payload: { sfxId }
              });
            }
          }
        };

        self.onmessage = function(e) {
          const payload = e.data;
          if (!payload || !payload.event) return;
          const handlers = listeners.get(payload.event);
          if (handlers && handlers.length > 0) {
            for (let i = 0; i < handlers.length; i++) {
              try {
                handlers[i](payload.data);
              } catch (err) {
                self.postMessage({
                  type: 'ERROR',
                  message: err && err.message ? err.message : String(err),
                  stack: err && err.stack ? err.stack : undefined
                });
              }
            }
          }
        };

        try {
          // Strict user-code sandbox execution with 'api' exposed
          (function(api) {
            ${userCode}
          })(api);

          self.postMessage({ type: 'READY' });
        } catch (err) {
          self.postMessage({
            type: 'ERROR',
            message: err && err.message ? err.message : String(err),
            stack: err && err.stack ? err.stack : undefined
          });
        }
      })();
    `;
  }

  private loadConfig(): Record<string, boolean> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveConfig(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const cfg: Record<string, boolean> = {};
      for (const p of this.plugins) {
        cfg[p.manifest.id] = p.enabled;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }
}

export const pluginHost = new PluginHostService();
