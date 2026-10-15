export interface TokenCoordinates {
  gridX: number;
  gridY: number;
  offsetX: number; // 0.0 to 1.0 sub-cell offset
  offsetY: number;
  elevationFt: number; // Vertical Z-axis
}

export interface CoreActor {
  id: string;
  name: string;
  type: 'character' | 'monster' | 'npc';
  vitals: {
    hpCurrent: number;
    hpMax: number;
    hpTemp: number;
    ac: number;
    speedFt: number;
    initiativeMod: number;
    conditions: string[];
  };
  sheetData?: Record<string, unknown>; // Extensible payload for D&D Beyond / SRD plugins
}
