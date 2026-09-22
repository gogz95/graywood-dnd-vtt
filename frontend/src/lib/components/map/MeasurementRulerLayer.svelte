<!-- src/lib/components/map/MeasurementRulerLayer.svelte -->
<!-- SVG Measurement Ruler & AoE Template Overlay Layer in pure world coordinates -->

<script lang="ts">
  export interface Waypoint {
    x: number;
    y: number;
  }

  export interface AoEOverlay {
    id: string;
    type: 'circle' | 'cone' | 'cube' | 'line';
    originX: number;
    originY: number;
    targetX?: number;
    targetY?: number;
    sizeFeet: number;
    color?: string;
    label?: string;
  }

  let {
    width = 4000,
    height = 3000,
    gridSize = 50,
    rulerStart = null,
    rulerCurrent = null,
    rulerWaypoints = [],
    aoeTemplates = [],
    feetPerGrid = 5,
  }: {
    width?: number;
    height?: number;
    gridSize?: number;
    rulerStart?: Waypoint | null;
    rulerCurrent?: Waypoint | null;
    rulerWaypoints?: Waypoint[];
    aoeTemplates?: AoEOverlay[];
    feetPerGrid?: number;
  } = $props();

  function calculateDistanceFeet(p1: Waypoint, p2: Waypoint): number {
    const dx = (p2.x - p1.x) / gridSize;
    const dy = (p2.y - p1.y) / gridSize;
    const cells = Math.hypot(dx, dy);
    return Math.round(cells * feetPerGrid);
  }

  function getSegmentMidpoint(p1: Waypoint, p2: Waypoint): Waypoint {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  }

  // Combined waypoint path from start through waypoints to current
  let fullRulerPath = $derived.by(() => {
    if (!rulerStart) return [];
    const pts: Waypoint[] = [rulerStart, ...rulerWaypoints];
    if (rulerCurrent) pts.push(rulerCurrent);
    return pts;
  });

  let totalRulerDistance = $derived.by(() => {
    if (fullRulerPath.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < fullRulerPath.length - 1; i++) {
      dist += calculateDistanceFeet(fullRulerPath[i], fullRulerPath[i + 1]);
    }
    return dist;
  });
</script>

<svg
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  class="absolute inset-0 pointer-events-none select-none z-20 overflow-visible"
>
  <defs>
    <!-- Ruler arrow marker -->
    <marker
      id="ruler-arrow"
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
    </marker>
  </defs>

  <!-- AoE Templates -->
  {#each aoeTemplates as aoe (aoe.id)}
    {@const radiusPx = (aoe.sizeFeet / feetPerGrid) * gridSize}
    {@const strokeColor = aoe.color || '#f59e0b'}

    {#if aoe.type === 'circle'}
      <circle
        cx={aoe.originX}
        cy={aoe.originY}
        r={radiusPx}
        fill={strokeColor}
        fill-opacity="0.2"
        stroke={strokeColor}
        stroke-width="2"
        stroke-dasharray="4 2"
      />
      {#if aoe.label}
        <text
          x={aoe.originX}
          y={aoe.originY - radiusPx - 6}
          text-anchor="middle"
          fill="#f8fafc"
          font-size="12"
          font-weight="bold"
          filter="drop-shadow(0 1px 2px rgba(0,0,0,0.8))"
        >
          {aoe.label} ({aoe.sizeFeet}ft)
        </text>
      {/if}
    {:else if aoe.type === 'cube'}
      {@const side = radiusPx * 2}
      <rect
        x={aoe.originX - radiusPx}
        y={aoe.originY - radiusPx}
        width={side}
        height={side}
        fill={strokeColor}
        fill-opacity="0.2"
        stroke={strokeColor}
        stroke-width="2"
      />
    {:else if aoe.type === 'cone' && aoe.targetX !== undefined && aoe.targetY !== undefined}
      {@const angle = Math.atan2(aoe.targetY - aoe.originY, aoe.targetX - aoe.originX)}
      {@const spread = Math.PI / 3}
      {@const p1x = aoe.originX + radiusPx * Math.cos(angle - spread / 2)}
      {@const p1y = aoe.originY + radiusPx * Math.sin(angle - spread / 2)}
      {@const p2x = aoe.originX + radiusPx * Math.cos(angle + spread / 2)}
      {@const p2y = aoe.originY + radiusPx * Math.sin(angle + spread / 2)}
      <path
        d="M {aoe.originX} {aoe.originY} L {p1x} {p1y} A {radiusPx} {radiusPx} 0 0 1 {p2x} {p2y} Z"
        fill={strokeColor}
        fill-opacity="0.25"
        stroke={strokeColor}
        stroke-width="2"
      />
    {:else if aoe.type === 'line' && aoe.targetX !== undefined && aoe.targetY !== undefined}
      <line
        x1={aoe.originX}
        y1={aoe.originY}
        x2={aoe.targetX}
        y2={aoe.targetY}
        stroke={strokeColor}
        stroke-width={gridSize}
        stroke-opacity="0.3"
        stroke-linecap="round"
      />
      <line
        x1={aoe.originX}
        y1={aoe.originY}
        x2={aoe.targetX}
        y2={aoe.targetY}
        stroke={strokeColor}
        stroke-width="2"
        stroke-dasharray="6 3"
      />
    {/if}
  {/each}

  <!-- Active Ruler Path & Waypoint Measurements -->
  {#if fullRulerPath.length >= 2}
    <!-- Polyline connecting waypoints -->
    <polyline
      points={fullRulerPath.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke="#0284c7"
      stroke-width="4"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.5"
    />
    <polyline
      points={fullRulerPath.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke="#38bdf8"
      stroke-width="2"
      stroke-dasharray="6 4"
      marker-end="url(#ruler-arrow)"
    />

    <!-- Waypoint Nodes -->
    {#each fullRulerPath as pt, idx}
      <circle
        cx={pt.x}
        cy={pt.y}
        r={idx === 0 || idx === fullRulerPath.length - 1 ? 5 : 4}
        fill="#38bdf8"
        stroke="#0f172a"
        stroke-width="2"
      />
    {/each}

    <!-- Segment Distance Badges -->
    {#each fullRulerPath.slice(0, -1) as p1, i}
      {@const p2 = fullRulerPath[i + 1]}
      {@const mid = getSegmentMidpoint(p1, p2)}
      {@const segDist = calculateDistanceFeet(p1, p2)}
      <g transform="translate({mid.x}, {mid.y})">
        <rect
          x="-24"
          y="-11"
          width="48"
          height="22"
          rx="11"
          fill="#0f172a"
          fill-opacity="0.9"
          stroke="#38bdf8"
          stroke-width="1.5"
        />
        <text
          x="0"
          y="4"
          text-anchor="middle"
          fill="#38bdf8"
          font-size="10"
          font-weight="bold"
        >
          {segDist} ft
        </text>
      </g>
    {/each}

    <!-- Total Distance Floating Pill at Endpoint -->
    {#if fullRulerPath.length > 2}
      {@const last = fullRulerPath[fullRulerPath.length - 1]}
      <g transform="translate({last.x}, {last.y - 24})">
        <rect
          x="-36"
          y="-12"
          width="72"
          height="24"
          rx="12"
          fill="#0284c7"
          stroke="#e0f2fe"
          stroke-width="1.5"
          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
        />
        <text
          x="0"
          y="4"
          text-anchor="middle"
          fill="#ffffff"
          font-size="11"
          font-weight="black"
        >
          {totalRulerDistance} ft
        </text>
      </g>
    {/if}
  {/if}
</svg>
