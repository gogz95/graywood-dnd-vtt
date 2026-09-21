# Multi-Window & Projector Broadcasting Architecture

Graywood VTT provides a decoupled projection system allowing Game Masters to drive dedicated hardware screens, secondary monitors, or digital tabletop projection rigs without exposing DM-facing hidden layers, stat blocks, or secret notes.

---

## 1. Multi-Window Topology

The projector operates across two independent browser/webview windows synchronized via the browser's native **BroadcastChannel** API:

1. **DM Workstation Shell (`/`)**:
   - Holds the master tactical mat, secret monster positions, dynamic lighting walls, unrevealed fog-of-war polygons, and campaign controls.
2. **Projector Viewport (`/projector`)**:
   - Clean player-facing canvas showing only illuminated terrain, revealed tokens, non-hidden handouts, and public combat overlays.

---

## 2. BroadcastChannel Protocol

Cross-window messages are transmitted over two dedicated channels:
- `graywood_vtt_channel`: Handouts, system alerts, and UI modals.
- `dnd_battlemat_sync`: Token movements, map updates, and fog-of-war reveal polygons.

### Key Message Types

| Message Type | Channel | Payload | Description |
| :--- | :--- | :--- | :--- |
| `TOKEN_MOVE` | `dnd_battlemat_sync` | `{ tokenId, x, y }` | Real-time token coordinates for player-visible tokens. |
| `FOG_UPDATE` | `dnd_battlemat_sync` | `{ polygons }` | Updated geometric visibility masks for Fog of War. |
| `SHOW_HANDOUT` | `graywood_vtt_channel` | `{ id, title, url, caption }` | Dispatches player handout modal to projector screen. |
| `HIDE_HANDOUT` | `graywood_vtt_channel` | `null` | Dismisses active handout modal on projector screen. |
| `GRID_UPDATE` | `dnd_battlemat_sync` | `{ gridSize, gridColor }` | Synchronizes grid dimensions and aesthetics. |
| `MAP_TEXTURE_UPDATE` | `dnd_battlemat_sync` | `{ url, width, height }` | Updates the active tactical background texture. |

---

## 3. Projector Route & Overlay Dismissal Behavior

In `frontend/src/routes/projector/+page.svelte`:

- **Handout Display**: When a `SHOW_HANDOUT` event is received, the high-resolution image overlay opens over the canvas with an animated backdrop blur.
- **Accessible Dismissal**:
  - The backdrop container is assigned `role="dialog"`, `tabindex="-1"`, and click-to-dismiss handlers.
  - Clicking outside the inner dialog box or pressing Escape automatically resets `activeHandout = null`, restoring the live tactical projection.
