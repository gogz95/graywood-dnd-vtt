<!-- TriggerLayer.svelte — Interactive Trigger Zones Layer for Traps, Portals, and Alerts -->
<!-- Visible on DM workstation with striped accent fills; invisible on projector -->
<script lang="ts">
  import { Application, Container, Graphics, Text } from 'pixi.js';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import type { TriggerZone } from '../../types/trigger';

  interface Props {
    pixiApp: Application | null;
    parentContainer: Container | null;
    gridSize?: number;
    isProjector?: boolean;
  }

  let {
    pixiApp = null,
    parentContainer = null,
    gridSize = 60,
    isProjector = false,
  }: Props = $props();

  let layerGraphics: Graphics | null = null;
  let layerLabelContainer: Container | null = null;

  $effect(() => {
    if (!parentContainer) return;

    if (!layerGraphics) {
      layerGraphics = new Graphics();
      parentContainer.addChild(layerGraphics);
    }
    if (!layerLabelContainer) {
      layerLabelContainer = new Container();
      parentContainer.addChild(layerLabelContainer);
    }

    renderTriggerZones();
  });

  export function renderTriggerZones() {
    if (!layerGraphics || !layerLabelContainer) return;

    layerGraphics.clear();
    layerLabelContainer.removeChildren().forEach((c) => c.destroy({ children: true }));

    // Never render un-triggered zones on projector route
    if (isProjector) {
      const revealedTraps = (canvasStore.triggerZones || []).filter(
        (z) => z.triggerType === 'trap' && z.isTriggered
      );
      for (const zone of revealedTraps) {
        drawRevealedTrapMarker(zone);
      }
      return;
    }

    const zones = canvasStore.triggerZones || [];
    for (const zone of zones) {
      drawDmTriggerZone(zone);
    }
  }

  function getZonePolygon(zone: TriggerZone): Array<{ x: number; y: number }> {
    if (zone.shape === 'rectangle') {
      if (zone.coordinates.length < 2) return [];
      const p1 = zone.coordinates[0];
      const p2 = zone.coordinates[1];
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
    }
    return zone.coordinates;
  }

  function drawDmTriggerZone(zone: TriggerZone) {
    if (!layerGraphics || !layerLabelContainer) return;

    const poly = getZonePolygon(zone);
    if (poly.length < 3) return;

    // Palette: Orange for Traps, Cyan for Portals/Teleport, Amber for Alerts
    const colorHex =
      zone.triggerType === 'trap'
        ? 0xf97316 // Orange
        : zone.triggerType === 'teleport'
          ? 0x06b6d4 // Cyan
          : 0xeab308; // Amber Alert

    const isConsumed = zone.onceOnly && zone.isTriggered;
    const baseAlpha = isConsumed ? 0.08 : zone.isEnabled ? 0.25 : 0.08;
    const strokeAlpha = isConsumed ? 0.35 : zone.isEnabled ? 0.9 : 0.3;

    // 1. Draw base translucent fill
    layerGraphics.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      layerGraphics.lineTo(poly[i].x, poly[i].y);
    }
    layerGraphics.closePath();
    layerGraphics.fill({ color: colorHex, alpha: baseAlpha });
    layerGraphics.stroke({
      color: colorHex,
      width: isConsumed ? 1.5 : 2.5,
      alpha: strokeAlpha,
    });

    // 2. Distinct Striped Accent Pattern (Diagonal lines)
    if (!isConsumed && zone.isEnabled) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const stripeSpacing = 24;
      for (let x = minX - (maxY - minY); x <= maxX + (maxY - minY); x += stripeSpacing) {
        layerGraphics
          .moveTo(x, minY)
          .lineTo(x + (maxY - minY), maxY)
          .stroke({ color: colorHex, width: 1.5, alpha: 0.2 });
      }
    }

    // 3. Crossed out if onceOnly consumed
    if (isConsumed) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      layerGraphics
        .moveTo(minX, minY)
        .lineTo(maxX, maxY)
        .stroke({ color: 0xef4444, width: 3, alpha: 0.7 });
      layerGraphics
        .moveTo(minX, maxY)
        .lineTo(maxX, minY)
        .stroke({ color: 0xef4444, width: 3, alpha: 0.7 });
    }

    // 4. Center Label & Icon Badge
    const center = getPolygonCenter(poly);
    const typeIcon =
      zone.triggerType === 'trap' ? '⚠️ TRAP' : zone.triggerType === 'teleport' ? '🌀 PORTAL' : '🔔 ALERT';

    const labelText = new Text({
      text: `${typeIcon}: ${zone.name}${isConsumed ? ' [CONSUMED]' : ''}`,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 10,
        fontWeight: 'bold',
        fill: isConsumed ? 0x94a3b8 : 0xffffff,
        align: 'center',
      },
    });
    labelText.anchor.set(0.5);
    labelText.position.set(center.x, center.y);

    const badgeBg = new Graphics();
    const bgW = labelText.width + 12;
    const bgH = labelText.height + 6;
    badgeBg
      .roundRect(center.x - bgW / 2, center.y - bgH / 2, bgW, bgH, 5)
      .fill({ color: 0x090b10, alpha: 0.85 })
      .stroke({ color: colorHex, width: 1, alpha: strokeAlpha });

    layerLabelContainer.addChild(badgeBg);
    layerLabelContainer.addChild(labelText);
  }

  function drawRevealedTrapMarker(zone: TriggerZone) {
    if (!layerGraphics || !layerLabelContainer) return;
    const poly = getZonePolygon(zone);
    if (poly.length < 3) return;

    const center = getPolygonCenter(poly);

    // Glowing red/orange revealed hazard rune
    layerGraphics
      .circle(center.x, center.y, 22)
      .fill({ color: 0x7f1d1d, alpha: 0.8 })
      .stroke({ color: 0xef4444, width: 2.5, alpha: 0.95 });

    const icon = new Text({
      text: '⚠️',
      style: {
        fontSize: 18,
      },
    });
    icon.anchor.set(0.5);
    icon.position.set(center.x, center.y);
    layerLabelContainer.addChild(icon);
  }

  function getPolygonCenter(poly: Array<{ x: number; y: number }>): { x: number; y: number } {
    let sumX = 0,
      sumY = 0;
    for (const p of poly) {
      sumX += p.x;
      sumY += p.y;
    }
    return {
      x: sumX / poly.length,
      y: sumY / poly.length,
    };
  }
</script>
