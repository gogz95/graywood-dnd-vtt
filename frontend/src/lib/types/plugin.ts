export type PluginSlot = 'sidebar_tab' | 'header_action' | 'canvas_overlay' | 'hud_dock';

export interface PluginInstance {
  destroy?: () => void;
}

export interface PluginContext {
  activeSceneId: () => string | null;
  activeTurnActorId: () => string | null;
  rollDice: (formula: string, label?: string) => void;
  sendWsEvent: (type: string, payload: unknown, ephemeral?: boolean) => void;
  on: <T = unknown>(event: string, handler: (payload: T) => void) => () => void;
  emit: <T = unknown>(event: string, payload: T, broadcastLan?: boolean) => void;
  getMeta: <T = unknown>(
    entityType: 'token' | 'actor' | 'scene',
    entityId: string,
    pluginId: string
  ) => T | undefined;
  setMeta: <T = unknown>(
    entityType: 'token' | 'actor' | 'scene',
    entityId: string,
    pluginId: string,
    value: T,
    ephemeral?: boolean
  ) => void;
  hasCapability: (pluginId: string) => boolean;
}

export interface PluginSlotBinding {
  slot: PluginSlot;
  title: string;
  icon: string;
  mount: (container: HTMLElement, context: PluginContext) => PluginInstance | void;
}

export interface VttPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabledByDefault?: boolean;
  slots: PluginSlotBinding[];
  onInit?: (context: PluginContext) => Promise<void> | void;
  onDestroy?: () => void;
}
