// src/lib/types/audio.ts
// Positional Spatial Audio Emitter Schema & Types

export interface AudioEmitter {
  id: string;
  fileUrl: string; // Path or URL to audio file (e.g. in campaign audio/ or synth preset)
  x: number; // World coordinate X (or grid col)
  y: number; // World coordinate Y (or grid row)
  innerRadius: number; // Distance in feet where volume is 100%
  outerRadius: number; // Distance in feet where sound fades to 0%
  loop: boolean;
  volume: number; // 0.0 to 1.0
  name?: string;
  isPlaying?: boolean;
  isProcedural?: boolean; // If true, synthesizes ambient sound (fire, river, humming crystal)
  proceduralType?: 'fire' | 'water' | 'hum' | 'wind';
}

export interface ListenerPosition {
  x: number;
  y: number;
  gridSize?: number;
}
