export type TriggerType = 'trap' | 'teleport' | 'alert';
export type TriggerShape = 'rectangle' | 'polygon';

export interface TrapAction {
  saveDc: number;
  saveType: string; // e.g. 'DEX', 'CON'
  damageFormula: string; // e.g. '2d10'
  message: string;
}

export interface TeleportAction {
  targetMapId?: string;
  targetX: number;
  targetY: number;
}

export interface AlertAction {
  gmNotification: string;
  playerToast?: string;
}

export type TriggerAction =
  | { type: 'trap'; trap: TrapAction }
  | { type: 'teleport'; teleport: TeleportAction }
  | { type: 'alert'; alert: AlertAction };

export interface TriggerZone {
  id: string;
  name: string;
  shape: TriggerShape;
  coordinates: Array<{ x: number; y: number }>;
  triggerType: TriggerType;
  triggerAction:
    | TrapAction
    | TeleportAction
    | AlertAction
    | {
        saveDc?: number;
        saveType?: string;
        damageFormula?: string;
        message?: string;
        targetMapId?: string;
        targetX?: number;
        targetY?: number;
        gmNotification?: string;
        playerToast?: string;
      };
  onceOnly: boolean;
  isEnabled: boolean;
  isTriggered?: boolean;
}

