// frontend/src/lib/canvas/vfx/shaders/AuraShaders.ts
// GLSL Shaders for Soft-Falloff Token Aura Emanations (Paladin Auras, Spirit Guardians)

/**
 * GLSL Fragment Shader: Soft-Falloff Modulated Token Aura Emanation
 * Renders concentric soft-edged radial glow with pulsating wave modulation,
 * eliminating hard circular clipping lines.
 */
export const AURA_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uCenter;          // Center of the aura emanation in UV (0.0 to 1.0)
uniform float uRadius;         // Aura boundary radius in UV
uniform float uAspect;         // Canvas viewport aspect ratio (width / height)
uniform vec3 uAuraColor;       // Base RGB color (e.g. vec3(0.95, 0.75, 0.20) for Holy Aura)
uniform float uTime;           // Epoch seconds for pulse and wave modulation
uniform float uInnerFade;      // Inner soft falloff threshold (e.g. 0.20)
uniform float uPulseSpeed;     // Frequency of pulse oscillation (default 2.5)
uniform float uWaveModulation; // Amplitude of edge wave distortion (default 0.04)

void main(void) {
    vec4 baseColor = texture2D(uSampler, vTextureCoord);
    
    // Correct UV coordinates for canvas aspect ratio
    vec2 diff = vTextureCoord - uCenter;
    diff.x *= uAspect;
    float dist = length(diff);
    
    // Angular coordinate for gentle celestial or ethereal wave modulation
    float angle = atan(diff.y, diff.x);
    float waveDistortion = sin(angle * 6.0 + uTime * 2.0) * uWaveModulation * uRadius;
    float effectiveRadius = uRadius + waveDistortion;
    
    if (dist <= effectiveRadius) {
        // Pulsating breath factor
        float pulse = sin(uTime * uPulseSpeed) * 0.15 + 0.85;
        
        // Smooth Hermite edge falloff: 1.0 at inner fade threshold, tapering to 0.0 at outer boundary
        float edgeTaper = 1.0 - smoothstep(effectiveRadius * (1.0 - uInnerFade), effectiveRadius, dist);
        
        // Subtle concentric harmonic ripple rings
        float ripple = sin(dist * 75.0 - uTime * 4.0) * 0.12 + 0.88;
        
        // Final alpha blend intensity
        float alpha = edgeTaper * pulse * ripple * 0.45;
        
        // Additive energy composite over base terrain
        vec3 auraGlow = uAuraColor * (edgeTaper * 0.9 + 0.1);
        baseColor.rgb += auraGlow * alpha;
    }
    
    gl_FragColor = baseColor;
}
`;

export interface AuraUniforms {
  center: [number, number];
  radius: number;
  aspect: number;
  auraColor: [number, number, number];
  time: number;
  innerFade: number;
  pulseSpeed: number;
  waveModulation: number;
}

export function createDefaultAuraUniforms(): AuraUniforms {
  return {
    center: [0.5, 0.5],
    radius: 0.2,
    aspect: 1.0,
    auraColor: [0.95, 0.78, 0.25], // Radiant Paladin Gold
    time: 0.0,
    innerFade: 0.35,
    pulseSpeed: 2.2,
    waveModulation: 0.03,
  };
}
