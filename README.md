# Graywood VTT

### *High-Performance, Local-First D&D 5e Virtual Tabletop & DM Workstation.*

[![CI Build](https://github.com/vtt/workstation/actions/workflows/ci.yml/badge.svg)](https://github.com/vtt/workstation/actions/workflows/ci.yml)
[![Release](https://github.com/vtt/workstation/actions/workflows/release.yml/badge.svg)](https://github.com/vtt/workstation/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![SRD Compliance: 5.1 & 5.2](https://img.shields.io/badge/SRD-5.1%20%2F%205.2%20(CC--BY--4.0)-green.svg)](https://www.dndbeyond.com/srd)
[![Tauri 2](https://img.shields.io/badge/Desktop-Tauri%202.0-orange.svg)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Core-Rust%201.85+-crimson.svg)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933.svg)](https://nodejs.org/)
[![Svelte 5](https://img.shields.io/badge/Frontend-Svelte%205-ff3e00.svg)](https://svelte.dev/)
[![PixiJS v8](https://img.shields.io/badge/Canvas-PixiJS%20v8-e91e63.svg)](https://pixijs.com/)

**Graywood VTT** is an offline-first, high-performance desktop workstation designed for Game Masters running Fifth Edition (5e) and Revised Fifth Edition (5.5e / 2024) tabletop roleplaying campaigns. Engineered with zero external server dependencies, $0 monthly subscription fees, and complete local network privacy.

---

## 1. Technology Stack

- **Frontend Application:** [Svelte 5](https://svelte.dev/) leveraging reactive runes (`$state`, `$derived`, `$props`, `$effect`), [Tailwind CSS](https://tailwindcss.com/), and [PixiJS v8](https://pixijs.com/) hardware-accelerated canvas.
- **Local Client Storage:** [Dexie.js](https://dexie.com/) (IndexedDB) with reactive mutation dispatching (`compendium:data-synchronized`) for zero-reload reactive updates.
- **Desktop Shell & Native Backend:** [Tauri v2](https://v2.tauri.app/), [Rust](https://www.rust-lang.org/) (`axum` embedded local LAN server, `rusqlite` transactional campaign database).
- **Environment & Tooling:** Node.js `>=22.0.0`, Rust `1.85+`.

---

## 2. Core Feature Architecture

### ⚔️ Tactical Battle Mat
- **Hardware-Accelerated Canvas:** PixiJS v8 WebGL 2 rendering pipeline delivering 60+ FPS token navigation and dynamic zoom/pan.
- **Dynamic Fog-of-War & Vision:** 2D radial raycasting via `visibility-polygon` computing instantaneous field-of-view and persistent explored-terrain masks.
- **Vector Wall Colliders:** Wall segment occlusion definitions `(x1, y1, x2, y2)` that block vision, line-of-sight, and ambient illumination.
- **Atmospheric Controls & Combat Hotbar:** Real-time environmental weather/lighting presets (candlelight, torches, magical darkness, fog) coupled with quick-action combat tokens and condition badges.

### 📥 Dual-Mode Source Material Ingestion
- **Mode A (Deterministic Offline):** Instant regex and GFM-pipe table extraction for 5e monster statblocks, spells, and roll tables without network latency or token costs.
- **Mode B (Local AI / Ollama):** Contextual sliding-window extraction for complex, unstructured tables, and multi-column sourcebooks.
- **Graceful Auto-Fallback:** Probes `http://localhost:11434/v1` and seamlessly falls back to Mode A if Ollama is unreachable or disabled.
- *(See [docs/architecture/ingestion.md](docs/architecture/ingestion.md) for detailed specifications.)*

### 🗺️ World Atlas Cartography
- **Azgaar `.map` Extraction:** Direct vector extraction and rendering of Azgaar Fantasy Map Generator archives.
- **Overland GIS Formats:** Native support for standard `.geojson` and `.json` region maps with interactive POI pins, settlement markers, and linked tactical battlemaps.

### 📽️ Decoupled Projector System
- **Dual-Screen & HDMI Tabletop Casting:** Broadcasts sanitized player-facing maps to physical gaming tables and secondary monitors.
- **Native Synchronization:** Utilizes browser `BroadcastChannel` (`graywood_vtt_channel` and `dnd_battlemat_sync`) for sub-millisecond multi-window sync (`TOKEN_MOVE`, `FOG_UPDATE`, `SHOW_HANDOUT`).
- *(See [docs/architecture/projector.md](docs/architecture/projector.md) for messaging protocols.)*

### 📜 Lore Chronicle & Parchment Studio
- **Markdown & Table Rendering:** GFM-compliant markdown table parsing and formatted handouts.
- **Wax Seal Customization & Security:** Stylized player handout presentation sanitized securely via DOMPurify.

---

## 3. System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           HOST DESKTOP ENVIRONMENT                            │
│                                                                               │
│  ┌────────────────────────┐                   ┌────────────────────────────┐  │
│  │    Svelte 5 / PixiJS   │                   │      Local Ollama LLM      │  │
│  │  DM Workstation Client │                   │        (qwen2.5:7b)        │  │
│  └───────────┬────────────┘                   └──────────────┬─────────────┘  │
│              │ Tauri IPC Bridge                              │ HTTP (11434)   │
│              ▼                                               ▼                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                           TAURI 2 DESKTOP CORE                          │  │
│  │                                                                         │  │
│  │   ┌───────────────────────┐            ┌────────────────────────────┐   │  │
│  │   │   Dexie / IndexedDB   │            │   Embedded Axum Service    │   │  │
│  │   │  (Compendium Storage) │            │   (HTTP & WebSocket :8080) │   │  │
│  │   └───────────────────────┘            └──────────────┬─────────────┘   │  │
│  │                                                       │                 │  │
│  │   ┌───────────────────────────────────────────────┐   │                 │  │
│  │   │    Embedded SQLite Storage Engine (WAL)       │◄──┘                 │  │
│  │   │    (Campaign State, Characters, SRD Rules)    │                     │  │
│  │   └───────────────────────────────────────────────┘                     │  │
│  └───────────────────────────────────────────────────────┬─────────────────┘  │
└──────────────────────────────────────────────────────────┼────────────────────┘
                                                           │ Local Wi-Fi / LAN
                                                           ▼
                                            ┌────────────────────────────┐
                                            │     PLAYER BROWSER PWAs    │
                                            │  (Phones / Tablets / PCs)  │
                                            │   PIN Sheet Authentication │
                                            └────────────────────────────┘
```

---

## 4. Prerequisites & Developer Quickstart

### Prerequisites
- **Node.js**: `>=22.0.0` (LTS)
- **Rust**: `1.85+` (Stable)
- **Tauri 2 CLI**: Installed via npm or cargo

### Setup & Execution Commands

```bash
# 1. Install root and frontend dependencies (requires Node 22+)
npm install
npm --prefix frontend install

# 2. Run in browser dev mode (fast web testing)
npm run dev

# 3. Run in native Tauri desktop environment
npm run tauri dev

# 4. Run full type and formatting checks
npm --prefix frontend run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

---

## 5. Technical Documentation

Detailed architectural blueprints and subsystem specifications:

- [docs/architecture/storage.md](docs/architecture/storage.md): Dexie.js schema layout (`ingestedTables`), reactive hydration loop, and `compendium:data-synchronized` events.
- [docs/architecture/ingestion.md](docs/architecture/ingestion.md): Dual-engine pipeline, deterministic regex heuristics, Ollama schema prompts, and fallback handling.
- [docs/architecture/projector.md](docs/architecture/projector.md): Multi-window projection, `BroadcastChannel` protocol, and overlay dismissal lifecycle.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): System architecture, Tauri IPC bridges, Axum embedded server, and SQLite storage design.
- [docs/LAN_NETWORKING_GUIDE.md](docs/LAN_NETWORKING_GUIDE.md): Local network play, firewall port mapping, and mobile client connectivity.
- [CONTRIBUTING.md](CONTRIBUTING.md): Engineering standards, Rust Clippy compliance, and PR validation rules.

---

## 6. Licensing & Legal Attribution

- **Software License:** Licensed under the [MIT License](LICENSE).
- **Game Rules Attribution:** Rules, stat blocks, spells, and mechanics are derived from the **Systems Reference Document 5.1 (SRD 5.1)** and **Systems Reference Document 5.2 (SRD 5.2)** published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/legalcode).
- Dungeons & Dragons is a trademark of Wizards of the Coast LLC. Graywood VTT is independent software and is not affiliated with Wizards of the Coast.