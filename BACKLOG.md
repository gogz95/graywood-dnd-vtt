# Graywood VTT — Master Development Backlog & Fix List

## Phase A: Architecture Hardening & Build Cleanups (Immediate)
- [x] **TKT-01: Vite Native Config Loader Fix**: Replace `__dirname` with `import.meta.dirname` in `frontend/vite.config.ts`.
- [x] **TKT-02: Chunk Splitting Optimization**:
  - Make `srdSeedService.ts` dynamic across all importing routes (`+page.svelte`, `Step2Scaffolding.svelte`).
  - Configure `manualChunks` in `vite.config.ts` for `compendium-data`, `pdfjs-dist`, and `pixi.js` to eliminate chunk warnings (>1000 kB).
- [x] **TKT-03: Ingestion UI Pipeline Linking**: Ensure parsed `.dd2vtt` files in the desktop dropzone automatically refresh `campaignDirectoryStore` maps list without manual restart.

## Phase B: Milestone 3 — Mobile Companion UI & Sync
- [x] **TKT-04: Mobile Route Shell (`frontend/src/routes/mobile/+page.svelte`)**:
  - Responsive, touch-first mobile layout with safe-area-inset padding for iOS/Android.
  - Virtual keypad PIN entry screen connecting to `/ws/companion`.
- [x] **TKT-05: Real-Time Mobile State Sync**:
  - Touch-friendly HP tracking card (+/- 1, +/- 5, damage/heal calculator mode).
  - Auto-reconnect with exponential backoff on screen sleep or Wi-Fi drops.
  - Periodic heartbeat ping every 15 seconds.
- [x] **TKT-06: Mobile Quick Dice Roller**:
  - Tap-to-roll dice tray (d4 through d20, advantage/disadvantage toggles).
  - Broadcast rolls to workstation via `RollDice` / `DiceResult`.

## Phase C: Milestone 4 — PixiJS Battlemap & Spatial Engine
- [x] **TKT-07: Canvas Viewport Controller**: Smooth panning, zoom limits, boundary clamping, and mouse-wheel dampening.
- [x] **TKT-08: Calibration & Grid Engine**:
  - Dynamic square, hex, and isometric grid rendering with custom color and opacity controls.
  - "3x3 Square" calibration drag tool to calculate exact PPI and align non-gridded maps.
- [x] **TKT-09: Token Management Layer**:
  - Drag tokens from sidebar/compendium onto the grid.
  - Automatic grid snapping and size scaling (Medium = 1x1, Large = 2x2, Huge = 3x3).
  - Overhead health bars and condition indicators.
- [x] **TKT-10: Dynamic Lighting & Fog of War (Core)**:
  - Extrude 2D raycasting polygon shadow masks using parsed UVTT `line_of_sight` and `portals`.
  - Manual DM fog eraser and brush tool for standard image maps.

## Phase D: Milestone 5 — Dual-Screen Projector & Tabletop View
- [x] **TKT-11: Secondary Window Management**:
  - Tauri secondary window or `/projector` browser route designed for flat-lying tabletop TV displays.
- [x] **TKT-12: Perspective Decoupling**:
  - Strict player-only view: hide GM notes, secret doors, hidden monster tokens, and unrevealed fog.
- [x] **TKT-13: Tabletop Hardware Tools**:
  - Quick blackout curtain hotkey (`Ctrl+Shift+B`) for DM prep transitions.
  - 1-inch physical grid scale calibration slider for TV tabletop accuracy.

## Phase E: Auxiliary Tabletop Engines (Post-Core VTT)
- [ ] **TKT-14: Combat & Turn Tracker**:
  - Initiative manager with condition tracking (Blinded, Stunned, Concentrating) synchronized to mobile companion devices.
- [ ] **TKT-15: Local Ambience & SFX Mixer**:
  - Multi-channel Web Audio soundboard playing directly from the campaign `audio/` directory.
  - Looping atmosphere layers with channel faders and one-shot sound effects triggers.
- [ ] **TKT-16: Markdown Campaign Journal**:
  - In-app DM scratchpad with automatic compendium entity linking (e.g. `[[Goblin]]` or `[[Fireball]]` hover tooltips).
  - Player handout broadcaster (one-click push of images/lore to player devices).
