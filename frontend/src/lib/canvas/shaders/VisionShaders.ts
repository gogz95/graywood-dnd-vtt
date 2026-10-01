// frontend/src/lib/canvas/shaders/VisionShaders.ts
// Multi-Tier Sensory Vision Shaders: Monochrome Darkvision, Blindsight Radar, & Magical Darkness

/**
 * GLSL Fragment Shader: 5e Monochrome Darkvision Pass
 * Inside darkvision radius, pitch-black areas are converted to high-contrast monochrome grayscale,
 * and dim lighting is elevated to bright illumination.
 */
export const DARKVISION_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uOrigin;          // Light source center in normalized UV coordinates (0.0 to 1.0)
uniform float uRadius;         // Darkvision radius in normalized coordinates
uniform float uAspect;         // Viewport aspect ratio (width / height)
uniform float uBrightnessBoost;// Elevation of dim light to bright (e.g. 1.45)
uniform float uContrast;       // Grayscale contrast curve multiplier (e.g. 1.35)

void main(void) {
    vec4 color = texture2D(uSampler, vTextureCoord);
    
    // Correct for aspect ratio to maintain circular radius
    vec2 diff = vTextureCoord - uOrigin;
    diff.x *= uAspect;
    float dist = length(diff);
    
    if (dist <= uRadius) {
        // Smooth falloff towards boundary edge
        float edgeBlend = 1.0 - smoothstep(uRadius * 0.85, uRadius, dist);
        
        // 5e SRD Darkvision Rule: See in darkness as if it were dim light (monochrome grayscale)
        // Standard NTSC perceptual luminance formula: Y = 0.299 R + 0.587 G + 0.114 B
        float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        
        // Boost dim illumination towards bright threshold
        luminance = pow(luminance, 1.0 / uBrightnessBoost);
        
        // High-contrast monochromatic grading
        luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);
        
        // Subtle cool night-vision tint (slight slate tint for cinematic clarity)
        vec3 darkvisionColor = vec3(luminance * 0.95, luminance * 0.98, luminance * 1.05);
        
        // Composite between standard color and monochrome darkvision
        color.rgb = mix(color.rgb, darkvisionColor, edgeBlend * 0.92);
    }
    
    gl_FragColor = color;
}
`;

/**
 * GLSL Fragment Shader: 5e Blindsight & Tremorsense Radar Pass
 * Bypasses line-of-sight wall colliders and magical darkness,
 * rendering pulsating neon acoustic radar wireframe rings over entities.
 */
export const BLINDSIGHT_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uOrigin;          // Observer center in UV
uniform float uRadius;         // Blindsight radius in UV
uniform float uAspect;
uniform float uTime;           // Animation epoch seconds
uniform vec3 uNeonColor;       // e.g. vec3(0.15, 0.95, 0.85) (Cyan/Emerald radar)

void main(void) {
    vec4 baseColor = texture2D(uSampler, vTextureCoord);
    
    vec2 diff = vTextureCoord - uOrigin;
    diff.x *= uAspect;
    float dist = length(diff);
    
    if (dist <= uRadius) {
        // Concentric acoustic wave rings: sin(dist * freq - time * speed)
        float wave = sin(dist * 120.0 - uTime * 6.0);
        float ringIntensity = smoothstep(0.75, 0.98, wave);
        
        // Outer boundary scanline ring
        float boundaryRing = 1.0 - smoothstep(0.0, 0.008, abs(dist - uRadius));
        
        // Edge falloff
        float falloff = 1.0 - (dist / uRadius);
        float glow = (ringIntensity * 0.45 + boundaryRing * 0.9) * falloff;
        
        baseColor.rgb += uNeonColor * glow;
    }
    
    gl_FragColor = baseColor;
}
`;

/**
 * GLSL Fragment Shader: 5e Magical Darkness Subtractive Pass
 * Extinguishes non-magical light sources and suppresses standard Darkvision.
 * Employs reverse subtractive blending (gl.FUNC_REVERSE_SUBTRACT) to carve an absolute void.
 */
export const MAGICAL_DARKNESS_FRAG_SHADER = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uOrigin;          // Darkness spell center in UV
uniform float uRadius;         // Sphere radius in UV
uniform float uAspect;
uniform float uEdgeSoftness;   // Spherical penumbra boundary (e.g. 0.05)

void main(void) {
    vec4 color = texture2D(uSampler, vTextureCoord);
    
    vec2 diff = vTextureCoord - uOrigin;
    diff.x *= uAspect;
    float dist = length(diff);
    
    if (dist <= uRadius) {
        // Magical Darkness is impenetrable: total suppression of light and color
        float penumbra = smoothstep(uRadius - uEdgeSoftness, uRadius, dist);
        // Eerie deep abyssal tint with faint purple core
        vec3 voidColor = vec3(0.01, 0.005, 0.02);
        color.rgb = mix(voidColor, color.rgb, penumbra);
        color.a = mix(1.0, color.a, penumbra);
    }
    
    gl_FragColor = color;
}
`;

export interface VisionShaderUniforms {
  darkvision: {
    origin: [number, number];
    radius: number;
    aspect: number;
    brightnessBoost: number;
    contrast: number;
  };
  blindsight: {
    origin: [number, number];
    radius: number;
    aspect: number;
    time: number;
    neonColor: [number, number, number];
  };
  magicalDarkness: {
    origin: [number, number];
    radius: number;
    aspect: number;
    edgeSoftness: number;
  };
}

export function createDefaultVisionUniforms(): VisionShaderUniforms {
  return {
    darkvision: {
      origin: [0.5, 0.5],
      radius: 0.25,
      aspect: 1.0,
      brightnessBoost: 1.45,
      contrast: 1.35,
    },
    blindsight: {
      origin: [0.5, 0.5],
      radius: 0.15,
      aspect: 1.0,
      time: 0.0,
      neonColor: [0.15, 0.95, 0.85],
    },
    magicalDarkness: {
      origin: [0.5, 0.5],
      radius: 0.20,
      aspect: 1.0,
      edgeSoftness: 0.02,
    },
  };
}
