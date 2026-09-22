<!-- src/lib/components/map/TokenCanvasLayer.svelte -->
<!-- World-coordinate DOM token layer projecting health bars, condition badges, and reticles in sync with the battlemat -->

<script lang="ts">
  import { tacticalViewport } from '../../services/canvas/tacticalViewportService.svelte';
  import TokenRadialMenu from '../canvas/TokenRadialMenu.svelte';

  export interface OverlayToken {
    id: string;
    name?: string;
    x: number;
    y: number;
    radius?: number;
    sizeInCells?: number;
    hp?: number;
    maxHp?: number;
    ac?: number;
    color?: string;
    tint?: number;
    textureUrl?: string;
    conditions?: string[];
    isOrbSealed?: boolean;
    isPlayer?: boolean;
    isActiveTurn?: boolean;
    isSelected?: boolean;
    monsterCompendiumId?: string;
  }

  let {
    tokens = $bindable([]),
    gridSize = 50,
    selectedTokenId = null,
    activeCombatantId = null,
    onSelectToken,
    onDropToken,
    onDropAsset,
  }: {
    tokens?: OverlayToken[];
    gridSize?: number;
    selectedTokenId?: string | null;
    activeCombatantId?: string | null;
    onSelectToken?: (id: string) => void;
    onDropToken?: (token: OverlayToken) => void;
    onDropAsset?: (asset: { type: string; filePath: string; url?: string; name?: string; assetType: string }, worldX: number, worldY: number) => void;
  } = $props();

  let radialMenuTokenId = $state<string | null>(null);
  const radialToken = $derived(tokens.find((t) => t.id === radialMenuTokenId) || null);

  function parseCreatureSizeCells(sizeStr?: string): number {
    if (!sizeStr) return 1;
    const s = sizeStr.toLowerCase();
    if (s.includes('large')) return 2;
    if (s.includes('huge')) return 3;
    if (s.includes('gargantuan')) return 4;
    return 1;
  }

  function snapToGridCenter(worldX: number, worldY: number, sizeCells = 1): { x: number; y: number } {
    const cellX = Math.floor(worldX / gridSize);
    const cellY = Math.floor(worldY / gridSize);
    return {
      x: Math.round((cellX + sizeCells / 2) * gridSize),
      y: Math.round((cellY + sizeCells / 2) * gridSize),
    };
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const rawData = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
    if (!rawData) return;

    try {
      const payload = JSON.parse(rawData);
      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - containerRect.left;
      const screenY = e.clientY - containerRect.top;
      const worldPos = tacticalViewport.screenToWorld(screenX, screenY);

      if (payload.type === 'MONSTER_TOKEN' || payload.monsterId || (payload.ac !== undefined && payload.hp !== undefined)) {
        const sizeCells = parseCreatureSizeCells(payload.size);
        const snapped = snapToGridCenter(worldPos.x, worldPos.y, sizeCells);
        const newToken: OverlayToken = {
          id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: payload.name || 'Creature',
          x: snapped.x,
          y: snapped.y,
          sizeInCells: sizeCells,
          radius: (sizeCells * gridSize) / 2,
          hp: payload.hp || 20,
          maxHp: payload.hp || 20,
          ac: payload.ac || 10,
          isPlayer: false,
          color: '#ef4444',
          monsterCompendiumId: payload.monsterId || payload.id,
        };
        tokens = [...tokens, newToken];
        onDropToken?.(newToken);
        return;
      }

      if (payload.type === 'IMAGE_ASSET') {
        const snapped = snapToGridCenter(worldPos.x, worldPos.y, 1);
        if (payload.assetType === 'token') {
          const newToken: OverlayToken = {
            id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: payload.name || 'Token',
            x: snapped.x,
            y: snapped.y,
            sizeInCells: 1,
            radius: gridSize / 2,
            hp: 15,
            maxHp: 15,
            ac: 10,
            isPlayer: false,
            color: '#38bdf8',
            textureUrl: payload.url,
          };
          tokens = [...tokens, newToken];
          onDropToken?.(newToken);
        } else {
          onDropAsset?.(payload, snapped.x, snapped.y);
        }
      }
    } catch (_) {}
  }

  function getTokenRadius(token: OverlayToken): number {
    if (token.radius && token.radius > 0) return token.radius;
    const cells = token.sizeInCells || 1;
    return (cells * gridSize) / 2;
  }

  function getHpPercentage(hp?: number, maxHp?: number): number {
    if (hp === undefined || maxHp === undefined || maxHp <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
  }

  function getHpColor(pct: number): string {
    if (pct > 50) return '#10b981'; // emerald
    if (pct > 20) return '#f59e0b'; // amber
    return '#ef4444'; // rose
  }
</script>

<div class="absolute inset-0 pointer-events-none select-none z-10">
  {#each tokens as token (token.id)}
    {@const r = getTokenRadius(token)}
    {@const diameter = r * 2}
    {@const hpPct = getHpPercentage(token.hp, token.maxHp)}
    {@const isSelected = selectedTokenId === token.id || token.isSelected}
    {@const isCurrentTurn = activeCombatantId === token.id || token.isActiveTurn}

    <div
      class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group transition-transform duration-75"
      style="left: {token.x}px; top: {token.y}px; width: {diameter}px; height: {diameter}px;"
      onclick={() => onSelectToken?.(token.id)}
      oncontextmenu={(e) => { e.preventDefault(); radialMenuTokenId = token.id; }}
      role="button"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelectToken?.(token.id);
      }}
    >
      <!-- Active turn pulse reticle -->
      {#if isCurrentTurn}
        <div
          class="absolute -inset-2 rounded-full border-2 border-amber-400 animate-ping opacity-75 pointer-events-none"
        ></div>
        <div
          class="absolute -inset-1.5 rounded-full border-2 border-amber-300 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.6)]"
        ></div>
      {/if}

      <!-- Selection outline -->
      {#if isSelected}
        <div
          class="absolute -inset-1 rounded-full border-2 border-cyan-400 pointer-events-none shadow-[0_0_10px_rgba(34,211,238,0.7)]"
        ></div>
      {/if}

      <!-- Token circle artwork or badge -->
      <div
        class="w-full h-full rounded-full border-2 overflow-hidden flex flex-col items-center justify-center relative shadow-xl backdrop-blur-xs"
        style="border-color: {token.isOrbSealed
          ? '#9333ea'
          : token.isPlayer
            ? '#38bdf8'
            : '#f87171'}; background-color: {token.color || '#1e293b'};"
      >
        {#if token.textureUrl}
          <img
            src={token.textureUrl}
            alt={token.name || token.id}
            class="w-full h-full object-cover"
          />
        {:else}
          <span
            class="text-[11px] font-black text-slate-100 uppercase tracking-tighter truncate px-1 text-center"
          >
            {token.name ? token.name.slice(0, 3) : token.id.slice(0, 3)}
          </span>
        {/if}

        <!-- Orb Sealed Aura -->
        {#if token.isOrbSealed}
          <div
            class="absolute inset-0 bg-purple-950/60 border border-purple-500 rounded-full pointer-events-none"
          ></div>
        {/if}
      </div>

      <!-- Health Bar -->
      {#if token.hp !== undefined && token.maxHp !== undefined}
        <div
          class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-full max-w-[56px] h-1.5 bg-slate-950/90 border border-slate-700/80 rounded-full overflow-hidden shadow-md pointer-events-none"
        >
          <div
            class="h-full transition-all duration-300"
            style="width: {hpPct}%; background-color: {getHpColor(hpPct)};"
          ></div>
        </div>
      {/if}

      <!-- Nameplate Floating Tooltip -->
      {#if token.name}
        <div
          class="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 border border-slate-700/80 text-[10px] font-semibold text-slate-200 px-1.5 py-0.5 rounded shadow pointer-events-none"
        >
          {token.name}
        </div>
      {/if}

      <!-- Condition Badges -->
      {#if token.conditions && token.conditions.length > 0}
        <div
          class="absolute -top-1 -right-1 flex flex-row gap-0.5 pointer-events-none"
        >
          {#each token.conditions.slice(0, 2) as condition}
            <span
              class="w-3.5 h-3.5 rounded-full bg-rose-600 border border-white/80 text-[8px] text-white flex items-center justify-center font-bold"
              title={condition}
            >
              {condition[0]}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <!-- Viewport-Anchored Radial HUD Menu -->
  {#if radialToken}
    <TokenRadialMenu
      worldX={radialToken.x}
      worldY={radialToken.y}
      hp={radialToken.hp || 20}
      maxHp={radialToken.maxHp || 20}
      conditions={radialToken.conditions || []}
      onDeltaHp={(delta) => {
        radialToken.hp = Math.max(0, Math.min(radialToken.maxHp || 20, (radialToken.hp || 20) + delta));
      }}
      onToggleCondition={(cond) => {
        const conds = radialToken.conditions || [];
        radialToken.conditions = conds.includes(cond)
          ? conds.filter((c) => c !== cond)
          : [...conds, cond];
      }}
      onClose={() => (radialMenuTokenId = null)}
    />
  {/if}
</div>
