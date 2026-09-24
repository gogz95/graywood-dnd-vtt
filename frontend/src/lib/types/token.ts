// src/lib/types/token.ts
// 5e Standard Sensory & Vision Properties and Token Types

export type VisionType = 'normal' | 'darkvision' | 'blindsight' | 'truesight' | 'blind';

export interface LightEmission {
  brightRadius: number; // in feet (e.g. 20 for Torch)
  dimRadius: number;    // in feet (e.g. 20 or 40 for Torch)
  color: string;        // Hex or CSS color string (e.g. '#ff9900')
  enabled: boolean;
}

export interface VttToken {
  id: string;
  name: string;
  x: number; // world x (center)
  y: number; // world y
  hp: number;
  maxHp: number;
  tempHp?: number;
  ac?: number;
  size: number; // grid cell footprint: 1=Med/Small, 2=Large, 3=Huge, 4=Gargantuan
  sizeCategory?: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  conditions: string[];
  isRevealed: boolean;
  isGmOnly: boolean;
  imageUrl?: string;
  color?: string;
  elevation?: number; // In feet (e.g. +20 flying, -10 burrowed)
  rotation?: number;  // In degrees, 0-360
  isPlayer?: boolean;
  isOrbSealed?: boolean;

  // 5e Standard Sensory & Vision Properties
  visionType?: VisionType;
  visionRange?: number; // Distance in feet (e.g. 60 for Darkvision)
  lightEmission?: LightEmission;
}

export type MapToken = VttToken;
