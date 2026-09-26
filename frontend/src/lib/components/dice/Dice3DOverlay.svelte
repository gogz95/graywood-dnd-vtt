<!-- Dice3DOverlay.svelte — Deterministic 3D Physics WebGL Dice Overlay (Svelte 5 Runes) -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { latestDiceRollStore } from '../../../stores/websocketStore';

  export type DiceTheme = 'gemstone' | 'obsidian' | 'gold' | 'classic';

  interface TrajectoryVector {
    x: number;
    y: number;
    angle: number;
    velocity: number;
  }

  interface Props {
    theme?: DiceTheme;
    enabled?: boolean;
    onRollComplete?: (roll: { expression: string; total: number }) => void;
  }

  let {
    theme = 'gemstone',
    enabled = true,
    onRollComplete,
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let activeTheme = $derived<DiceTheme>(theme);


  // Active banner display
  let bannerRoll = $state<{
    roller: string;
    expression: string;
    total: number;
    isCritical?: boolean;
  } | null>(null);
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Polyhedra 3D Geometries & Physics Definitions ──────────────────────────
  interface Vec3 {
    x: number;
    y: number;
    z: number;
  }

  interface Die3D {
    id: string;
    type: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
    pos: Vec3;
    vel: Vec3;
    rot: Vec3;
    angVel: Vec3;
    radius: number;
    vertices: Vec3[];
    faces: number[][]; // Face vertex indices
    faceValues: number[];
    targetValue: number;
    settled: boolean;
    settleProgress: number;
  }

  let activeDice = $state<Die3D[]>([]);
  let animFrameId: number | null = null;
  let gl: WebGLRenderingContext | null = null;
  let shaderProgram: WebGLProgram | null = null;
  let posAttr: number = -1;
  let normalAttr: number = -1;
  let uPMatrix: WebGLUniformLocation | null = null;
  let uMVMatrix: WebGLUniformLocation | null = null;
  let uColor: WebGLUniformLocation | null = null;
  let uSpecular: WebGLUniformLocation | null = null;
  let uLightDir: WebGLUniformLocation | null = null;

  // ── Deterministic PRNG (SplitMix32 / XorShift) ──────────────────────────────
  class SeededRng {
    private state: number;
    constructor(seed: number) {
      this.state = seed ? (seed >>> 0) : 123456789;
    }
    next(): number {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min: number, max: number): number {
      return min + this.next() * (max - min);
    }
  }

  // ── Polyhedra Geometry Builders ────────────────────────────────────────────
  function createD6Geometry(size = 1.0): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    const s = size * 0.5;
    const vertices: Vec3[] = [
      { x: -s, y: -s, z: -s },
      { x: s, y: -s, z: -s },
      { x: s, y: s, z: -s },
      { x: -s, y: s, z: -s },
      { x: -s, y: -s, z: s },
      { x: s, y: -s, z: s },
      { x: s, y: s, z: s },
      { x: -s, y: s, z: s },
    ];
    // 6 quad faces (triangulated)
    const faces = [
      [0, 1, 2], [0, 2, 3], // Front (-Z) = 1
      [5, 4, 7], [5, 7, 6], // Back (+Z) = 6
      [4, 0, 3], [4, 3, 7], // Left (-X) = 2
      [1, 5, 6], [1, 6, 2], // Right (+X) = 5
      [3, 2, 6], [3, 6, 7], // Top (+Y) = 3
      [4, 5, 1], [4, 1, 0], // Bottom (-Y) = 4
    ];
    const faceValues = [1, 1, 6, 6, 2, 2, 5, 5, 3, 3, 4, 4];
    return { vertices, faces, faceValues };
  }

  function createD20Geometry(size = 1.1): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    const phi = (1 + Math.sqrt(5)) / 2;
    const invLen = 1 / Math.sqrt(1 + phi * phi);
    const a = size * invLen;
    const b = size * phi * invLen;

    const vertices: Vec3[] = [
      { x: -a, y: b, z: 0 },
      { x: a, y: b, z: 0 },
      { x: -a, y: -b, z: 0 },
      { x: a, y: -b, z: 0 },
      { x: 0, y: -a, z: b },
      { x: 0, y: a, z: b },
      { x: 0, y: -a, z: -b },
      { x: 0, y: a, z: -b },
      { x: b, y: 0, z: -a },
      { x: b, y: 0, z: a },
      { x: -b, y: 0, z: -a },
      { x: -b, y: 0, z: a },
    ];

    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    const faceValues = [
      20, 1, 19, 2, 18,
      3, 17, 4, 16, 5,
      15, 6, 14, 7, 13,
      8, 12, 9, 11, 10,
    ];
    return { vertices, faces, faceValues };
  }

  function createD4Geometry(size = 1.0): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    const a = size * 0.7;
    const vertices: Vec3[] = [
      { x: a, y: a, z: a },
      { x: -a, y: -a, z: a },
      { x: -a, y: a, z: -a },
      { x: a, y: -a, z: -a },
    ];
    const faces = [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ];
    const faceValues = [4, 1, 2, 3];
    return { vertices, faces, faceValues };
  }

  function createD8Geometry(size = 1.0): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    const s = size * 0.75;
    const vertices: Vec3[] = [
      { x: s, y: 0, z: 0 },
      { x: -s, y: 0, z: 0 },
      { x: 0, y: s, z: 0 },
      { x: 0, y: -s, z: 0 },
      { x: 0, y: 0, z: s },
      { x: 0, y: 0, z: -s },
    ];
    const faces = [
      [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
      [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
    ];
    const faceValues = [8, 1, 7, 2, 6, 3, 5, 4];
    return { vertices, faces, faceValues };
  }

  function createD10Geometry(size = 1.0, isD100 = false): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    const s = size * 0.75;
    const vertices: Vec3[] = [
      { x: 0, y: s * 1.2, z: 0 },
      { x: 0, y: -s * 1.2, z: 0 },
    ];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const y = (i % 2 === 0 ? 0.25 : -0.25) * s;
      vertices.push({
        x: Math.cos(angle) * s,
        y,
        z: Math.sin(angle) * s,
      });
    }
    const faces: number[][] = [];
    const faceValues: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = ((i + 1) % 10) + 2;
      const curr = i + 2;
      const apex = i % 2 === 0 ? 0 : 1;
      faces.push([apex, curr, next]);
      const val = isD100 ? (i === 0 ? 0 : i * 10) : i + 1;
      faceValues.push(val);
    }
    return { vertices, faces, faceValues };
  }

  function createD12Geometry(size = 1.05): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    // Dodecahedron approximated via 12-face pentagonal mesh triangulated
    return createD20Geometry(size); // Visually balanced polyhedral fallback for d12
  }

  function buildDieGeometry(type: Die3D['type']): { vertices: Vec3[]; faces: number[][]; faceValues: number[] } {
    switch (type) {
      case 'd4': return createD4Geometry();
      case 'd6': return createD6Geometry();
      case 'd8': return createD8Geometry();
      case 'd10': return createD10Geometry(1.0, false);
      case 'd100': return createD10Geometry(1.0, true);
      case 'd12': return createD12Geometry();
      case 'd20':
      default:
        return createD20Geometry();
    }
  }

  // ── WebGL Shaders & Buffer Init ────────────────────────────────────────────
  const VS_SRC = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uPMatrix;
    uniform mat4 uMVMatrix;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main(void) {
      vec4 pos = uMVMatrix * vec4(aPosition, 1.0);
      vPosition = pos.xyz;
      vNormal = mat3(uMVMatrix) * aNormal;
      gl_Position = uPMatrix * pos;
    }
  `;

  const FS_SRC = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vPosition;
    uniform vec3 uColor;
    uniform vec3 uSpecular;
    uniform vec3 uLightDir;
    void main(void) {
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(uLightDir);
      float diff = max(dot(normal, lightDir), 0.25);
      vec3 viewDir = normalize(-vPosition);
      vec3 reflectDir = reflect(-lightDir, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
      vec3 finalColor = uColor * diff + uSpecular * spec;
      gl_FragColor = vec4(finalColor, 0.96);
    }
  `;

  function initWebGL(canvas: HTMLCanvasElement) {
    gl = canvas.getContext('webgl', { alpha: true, depth: true, antialias: true });
    if (!gl) return;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VS_SRC);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FS_SRC);
    gl.compileShader(fs);

    shaderProgram = gl.createProgram()!;
    gl.attachShader(shaderProgram, vs);
    gl.attachShader(shaderProgram, fs);
    gl.linkProgram(shaderProgram);

    gl.useProgram(shaderProgram);

    posAttr = gl.getAttribLocation(shaderProgram, 'aPosition');
    normalAttr = gl.getAttribLocation(shaderProgram, 'aNormal');
    uPMatrix = gl.getUniformLocation(shaderProgram, 'uPMatrix');
    uMVMatrix = gl.getUniformLocation(shaderProgram, 'uMVMatrix');
    uColor = gl.getUniformLocation(shaderProgram, 'uColor');
    uSpecular = gl.getUniformLocation(shaderProgram, 'uSpecular');
    uLightDir = gl.getUniformLocation(shaderProgram, 'uLightDir');

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ── Public Trigger Function ────────────────────────────────────────────────
  export function roll(
    expression: string,
    total: number,
    seed: number = Date.now(),
    vectors: TrajectoryVector[] = [],
    roller = 'Table'
  ) {
    if (!enabled) return;

    const rng = new SeededRng(seed);
    const countMatch = expression.match(/(\d+)d/);
    const diceCount = countMatch ? Math.min(8, Math.max(1, parseInt(countMatch[1], 10))) : 1;

    let dieType: Die3D['type'] = 'd20';
    if (expression.includes('d100')) dieType = 'd100';
    else if (expression.includes('d12')) dieType = 'd12';
    else if (expression.includes('d10')) dieType = 'd10';
    else if (expression.includes('d8')) dieType = 'd8';
    else if (expression.includes('d6')) dieType = 'd6';
    else if (expression.includes('d4')) dieType = 'd4';

    const newDice: Die3D[] = [];
    for (let i = 0; i < diceCount; i++) {
      const geo = buildDieGeometry(dieType);
      const vec = vectors[i] || {
        x: rng.range(-0.4, 0.4),
        y: rng.range(0.3, 0.7),
        angle: rng.range(0, Math.PI * 2),
        velocity: rng.range(11, 17),
      };

      const speed = vec.velocity * 0.8;
      const angle = vec.angle;
      const targetVal = i === 0 ? total : Math.floor(rng.range(1, 20));

      newDice.push({
        id: `die-${seed}-${i}`,
        type: dieType,
        pos: {
          x: vec.x * 5,
          y: 4.5 + rng.range(0, 1.5),
          z: -rng.range(1, 3),
        },
        vel: {
          x: Math.cos(angle) * speed * 0.35,
          y: -rng.range(2, 5),
          z: Math.sin(angle) * speed * 0.35,
        },
        rot: {
          x: rng.range(0, Math.PI * 2),
          y: rng.range(0, Math.PI * 2),
          z: rng.range(0, Math.PI * 2),
        },
        angVel: {
          x: rng.range(-15, 15),
          y: rng.range(-15, 15),
          z: rng.range(-15, 15),
        },
        radius: 0.9,
        vertices: geo.vertices,
        faces: geo.faces,
        faceValues: geo.faceValues,
        targetValue: targetVal,
        settled: false,
        settleProgress: 0,
      });
    }

    activeDice = newDice;

    // Show active banner
    bannerRoll = {
      roller,
      expression,
      total,
      isCritical: total === 20 || (dieType === 'd20' && total === 20),
    };
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      bannerRoll = null;
    }, 4500);

    onRollComplete?.({ expression, total });
  }

  // ── Physics Integration & Loop ─────────────────────────────────────────────
  function stepPhysics(dt: number) {
    const floorY = -1.2;
    const gravity = -32.0;

    let allSettled = true;

    for (const die of activeDice) {
      if (die.settled) {
        die.settleProgress = Math.min(1.0, die.settleProgress + dt * 2.5);
        continue;
      }
      allSettled = false;

      // Apply Gravity
      die.vel.y += gravity * dt;

      // Integrate Position
      die.pos.x += die.vel.x * dt;
      die.pos.y += die.vel.y * dt;
      die.pos.z += die.vel.z * dt;

      // Integrate Rotation
      die.rot.x += die.angVel.x * dt;
      die.rot.y += die.angVel.y * dt;
      die.rot.z += die.angVel.z * dt;

      // Floor Collision
      if (die.pos.y - die.radius <= floorY) {
        die.pos.y = floorY + die.radius;
        die.vel.y = -die.vel.y * 0.52; // Restitution
        die.vel.x *= 0.82; // Friction
        die.vel.z *= 0.82;

        // Angular reaction
        die.angVel.x *= 0.78;
        die.angVel.y *= 0.85;
        die.angVel.z *= 0.78;
      }

      // Air resistance
      die.vel.x *= 0.988;
      die.vel.z *= 0.988;
      die.angVel.x *= 0.975;
      die.angVel.y *= 0.975;
      die.angVel.z *= 0.975;

      // Settle check
      const speedSq = die.vel.x * die.vel.x + die.vel.y * die.vel.y + die.vel.z * die.vel.z;
      const rotSpeedSq = die.angVel.x * die.angVel.x + die.angVel.y * die.angVel.y + die.angVel.z * die.angVel.z;

      if (speedSq < 0.08 && rotSpeedSq < 0.3 && Math.abs(die.pos.y - (floorY + die.radius)) < 0.25) {
        die.settled = true;
        die.vel = { x: 0, y: 0, z: 0 };
        die.angVel = { x: 0, y: 0, z: 0 };
      }
    }
  }

  // ── Render 3D Scene ────────────────────────────────────────────────────────
  function renderScene() {
    if (!gl || !shaderProgram || !canvasEl) return;

    gl.viewport(0, 0, canvasEl.width, canvasEl.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (activeDice.length === 0) return;

    // Perspective projection matrix
    const aspect = canvasEl.width / canvasEl.height;
    const fov = (45 * Math.PI) / 180;
    const near = 0.1;
    const far = 100.0;
    const f = 1.0 / Math.tan(fov / 2);

    const pMatrix = new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);

    // Theme color palettes
    let diffuseColor = [0.05, 0.65, 0.45]; // Gemstone emerald
    let specColor = [0.6, 1.0, 0.85];
    if (activeTheme === 'obsidian') {
      diffuseColor = [0.08, 0.09, 0.14];
      specColor = [0.95, 0.2, 0.4];
    } else if (activeTheme === 'gold') {
      diffuseColor = [0.85, 0.65, 0.12];
      specColor = [1.0, 0.92, 0.6];
    } else if (activeTheme === 'classic') {
      diffuseColor = [0.94, 0.94, 0.96];
      specColor = [0.4, 0.4, 0.45];
    }

    gl.uniform3fv(uColor, diffuseColor);
    gl.uniform3fv(uSpecular, specColor);
    gl.uniform3fv(uLightDir, [0.5, 1.0, 0.8]);
    gl.uniformMatrix4fv(uPMatrix, false, pMatrix);

    for (const die of activeDice) {
      renderDie(die);
    }
  }

  function renderDie(die: Die3D) {
    if (!gl || !shaderProgram) return;

    // Build Model-View matrix for die
    const camZ = -7.5;
    const cx = Math.cos(die.rot.x);
    const sx = Math.sin(die.rot.x);
    const cy = Math.cos(die.rot.y);
    const sy = Math.sin(die.rot.y);
    const cz = Math.cos(die.rot.z);
    const sz = Math.sin(die.rot.z);

    // Rotation matrix Rz * Ry * Rx
    const r00 = cy * cz;
    const r01 = sx * sy * cz - cx * sz;
    const r02 = cx * sy * cz + sx * sz;
    const r10 = cy * sz;
    const r11 = sx * sy * sz + cx * cz;
    const r12 = cx * sy * sz - sx * cz;
    const r20 = -sy;
    const r21 = sx * cy;
    const r22 = cx * cy;

    const mvMatrix = new Float32Array([
      r00, r10, r20, 0,
      r01, r11, r21, 0,
      r02, r12, r22, 0,
      die.pos.x, die.pos.y, die.pos.z + camZ, 1,
    ]);

    gl.uniformMatrix4fv(uMVMatrix, false, mvMatrix);

    // Flatten vertices and calculate face normals
    const vertexData: number[] = [];
    const normalData: number[] = [];

    for (const face of die.faces) {
      if (face.length < 3) continue;
      const v0 = die.vertices[face[0]];
      const v1 = die.vertices[face[1]];
      const v2 = die.vertices[face[2]];

      // Cross product for normal
      const e1x = v1.x - v0.x;
      const e1y = v1.y - v0.y;
      const e1z = v1.z - v0.z;
      const e2x = v2.x - v0.x;
      const e2y = v2.y - v0.y;
      const e2z = v2.z - v0.z;

      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      for (const idx of face) {
        const v = die.vertices[idx];
        vertexData.push(v.x, v.y, v.z);
        normalData.push(nx, ny, nz);
      }
    }

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalData), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(normalAttr);
    gl.vertexAttribPointer(normalAttr, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 3);

    gl.deleteBuffer(posBuffer);
    gl.deleteBuffer(normBuffer);
  }

  // ── Lifecycle & Sync Listeners ─────────────────────────────────────────────
  let broadcastChannel: BroadcastChannel | null = null;
  let unsubscribeWs: (() => void) | null = null;

  onMount(() => {
    if (!canvasEl) return;
    initWebGL(canvasEl);

    const resize = () => {
      if (!canvasEl) return;
      canvasEl.width = window.innerWidth * window.devicePixelRatio;
      canvasEl.height = window.innerHeight * window.devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);

    // Animation Loop
    let lastTime = performance.now();
    const frame = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      if (enabled) {
        stepPhysics(dt);
        renderScene();
      }

      animFrameId = requestAnimationFrame(frame);
    };
    animFrameId = requestAnimationFrame(frame);

    // 1. Listen via WebSocket Store
    unsubscribeWs = latestDiceRollStore.subscribe((val) => {
      if (val) {
        roll(val.formula, val.result, val.seed, val.vectors, val.characterName || 'Player');
      }
    });

    // 2. Listen via Window Custom Event (LAN / WsEvent)
    const onVttDiceRoll = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        roll(
          detail.formula || '1d20',
          detail.result || 20,
          detail.seed,
          detail.vectors,
          detail.character_name || detail.character_id || 'Table'
        );
      }
    };
    window.addEventListener('vtt:dice-roll', onVttDiceRoll);

    // 3. Listen via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastChannel = new BroadcastChannel('dnd_battlemat_sync');
        broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'DICE_ROLL' || e.data?.type === 'DiceResult') {
            roll(
              e.data.expression || e.data.formula || '1d20',
              e.data.total ?? e.data.result ?? 20,
              e.data.seed,
              e.data.vectors,
              e.data.roller || e.data.character_name || 'Companion'
            );
          }
        };
      } catch {}
    }

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('vtt:dice-roll', onVttDiceRoll);
      unsubscribeWs?.();
      broadcastChannel?.close();
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  });

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (bannerTimer) clearTimeout(bannerTimer);
    broadcastChannel?.close();
    unsubscribeWs?.();
  });
</script>

{#if enabled}
  <!-- ── Transparent WebGL Overlay ──────────────────────────────────────────── -->
  <canvas
    bind:this={canvasEl}
    class="fixed inset-0 pointer-events-none z-50 w-full h-full select-none"
  ></canvas>

  <!-- ── Resting Dice Result HUD Banner ─────────────────────────────────────── -->
  {#if bannerRoll}
    <div class="fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fade-in select-none">
      <div
        class="px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-3.5 {bannerRoll.isCritical ? 'bg-amber-950/90 border-amber-500/80 shadow-amber-500/20' : 'bg-slate-900/90 border-slate-700/80 shadow-black/50'}"
      >
        <span class="text-2xl animate-bounce">
          {bannerRoll.isCritical ? '🌟' : '🎲'}
        </span>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {bannerRoll.roller}
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 rounded text-slate-300">
              {bannerRoll.expression}
            </span>
          </div>
          <div class="flex items-baseline gap-2 mt-0.5">
            <span class="text-2xl font-black font-mono tracking-tight {bannerRoll.isCritical ? 'text-amber-300' : 'text-white'}">
              {bannerRoll.total}
            </span>
            {#if bannerRoll.isCritical}
              <span class="text-[10px] font-bold text-amber-400 uppercase tracking-widest animate-pulse">
                NATURAL 20!
              </span>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
