export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface MapSceneData {
  id: string;
  name: string;
  type: string; // 'tactical_2d' | 'tactical_3d' | 'overland_atlas' | 'zone_mind'
  grid: {
    type: 'square' | 'hex' | 'none';
    size: number;
    scaleFeet: number;
  };
  assetUrl?: string;
  walls?: Array<{ id: string; p1: [number, number]; p2: [number, number]; blocksVision: boolean }>;
}

export interface MapInteractionCallbacks {
  onTokenMoved: (tokenId: string, position: { x: number; y: number; elevation?: number }) => void;
  onTokenSelected: (tokenId: string | null) => void;
  onViewportChanged: (transform: ViewportTransform) => void;
  onPingPoint?: (coords: { x: number; y: number }) => void;
}

export interface ViewportProvider {
  id: string;
  name: string;
  supportedSceneTypes: string[];
  mount: (
    container: HTMLElement,
    props: {
      scene: MapSceneData;
      tokens: any[];
      isDmView: boolean;
      callbacks: MapInteractionCallbacks;
      activeTool?: string;
    }
  ) => { destroy?: () => void; update?: (newProps: any) => void };
}
