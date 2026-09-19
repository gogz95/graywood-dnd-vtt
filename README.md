# D&D 5e / 5.5e Virtual Tabletop (VTT) Desktop Workstation

[![CI Build](https://github.com/vtt/workstation/actions/workflows/ci.yml/badge.svg)](https://github.com/vtt/workstation/actions/workflows/ci.yml)
[![Release](https://github.com/vtt/workstation/actions/workflows/release.yml/badge.svg)](https://github.com/vtt/workstation/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![SRD Compliance: 5.1 & 5.2](https://img.shields.io/badge/SRD-5.1%20%2F%205.2%20(CC--BY--4.0)-green.svg)](https://www.dndbeyond.com/srd)
[![Tauri 2](https://img.shields.io/badge/Desktop-Tauri%202.0-orange.svg)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Core-Rust%201.78+-crimson.svg)](https://www.rust-lang.org/)
[![Svelte 5](https://img.shields.io/badge/Frontend-Svelte%205-ff3e00.svg)](https://svelte.dev/)
[![PixiJS v8](https://img.shields.io/badge/Canvas-PixiJS%20v8-e91e63.svg)](https://pixijs.com/)

An offline-first, high-performance desktop workstation designed for Game Masters running Fifth Edition (5e) and Revised Fifth Edition (5.5e / 2024) tabletop roleplaying campaigns. Engineered with zero external server dependencies, $0 monthly subscription fees, and complete local network privacy.

---

## 1. Architectural Overview

The workstation consolidates native desktop management, an embedded local web server, transactional SQLite storage, hardware-accelerated 2D tactical map rendering, and local retrieval-augmented intelligence into a unified single-binary desktop architecture.

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
│  │   │  Local LanceDB Store  │◄───────────┤   Embedded Axum Service    │   │  │
│  │   │  (SRD Vector Indices) │            │   (HTTP & WebSocket :8080) │   │  │
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

## 2. Core Feature Highlights

### $0 Operational Budget & 100% Offline-First
- **Zero Cloud Subscriptions**: No monthly hosting fees, proprietary cloud servers, or telemetric tracking.
- **Air-Gapped Operation**: Runs completely severed from the internet—ideal for remote gaming cabins, conventions, or home private sessions.
- **Single Portable Vault**: All campaign assets, battlemaps, encounters, and character states persist in a single, version-controlled SQLite database (`campaign.db`).

### Tactical Dual-Canvas Engine (PixiJS v8)
- **Dynamic 2D Raycasting**: Real-time line-of-sight and field-of-view occlusion powered by `visibility-polygon`.
- **Fog-of-War**: Continuous tracking of explored terrain and obscured darkness; players only see what their character tokens illuminate.
- **High FPS Hardware Acceleration**: WebGL 2 rendering pipeline capable of rendering hundreds of concurrent monster tokens, spell effect meshes, and tactical grid overlays at 60+ frames per second.

### Automated 5e & 5.5e (2024) SRD Mechanics
- **SRD 5.1 & SRD 5.2 Datasets**: Embedded rules compendium covering standard classes, subclasses, spells, monsters, magic items, conditions, and equipment.
- **Tactical Encounter Tracker**: Automated turn sequencing, round timers, initiative sorting, condition countdowns, and death saving throw tracking.
- **Deterministic Action Resolution**: Instant calculation of spell slot expenditures, resistance/vulnerability math, and short/long rest recovery.

### Embedded Axum LAN Server & Mobile PWA
- **Local Wi-Fi Distribution**: Hosts an internal Axum 0.7 server on port `8080`.
- **Zero App Installation for Players**: Players simply open Safari, Chrome, or Firefox on their smartphone or tablet and navigate to `http://<DM_IP>:8080`.
- **4-Digit PIN Authentication**: Players claim and control their assigned character sheet securely via a private 4-digit numeric code.
- **Bi-Directional WebSocket Synchronization**: Real-time state replication between player sheets and the DM tactical view with sub-5 millisecond latency.

### Local AI Rules Referee (Ollama + LanceDB)
- **Zero-Latency RAG Search**: Queries the SRD 5.1 and 5.2 compendiums using embedded local vector embeddings stored in LanceDB.
- **Deterministic Clarifications**: Executes `qwen2.5:7b` via local Ollama at `temperature: 0.0` to eliminate hallucinations and produce exact mechanical rulings.

---

## 3. System Prerequisites

Before building or running the project locally, verify that your development workstation meets these minimum software requirements:

| Component | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Rust Toolchain** | `1.78.0+` (Stable) | Includes `cargo`, `rustc`, and `clippy`. |
| **Node.js** | `20.x+` (LTS) | Bundled with `npm 10.x+`. |
| **Tauri 2 CLI** | `2.0.0+` | Installed via `npm` or `cargo install tauri-cli --version "^2.0"`. |
| **Ollama** | Optional (for AI RAG) | Required only for local AI rules referee. |

### Operating System Dependencies for Tauri 2

#### Linux (Debian / Ubuntu)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### macOS
Install the official Xcode Command Line Tools:
```bash
xcode-select --install
```

#### Windows
Install the **Microsoft Visual Studio C++ Build Tools** with the "Desktop development with C++" workload enabled. The Windows WebView2 Runtime is pre-installed on Windows 10/11.

---

## 4. Installation & Local Development

### 1. Clone the Repository
```bash
git clone https://github.com/vtt/workstation.git
cd workstation
```

### 2. Install Dependencies
Install the frontend client packages and root development tooling:
```bash
npm install --prefix frontend
npm install
```

### 3. Setup Local AI RAG (Optional)
If you wish to utilize the offline AI rules referee:
```bash
ollama serve
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

### 4. Launch Development Environment
Execute the hot-reloading desktop development environment:
```bash
npm run tauri dev
```
This command compiles the Rust core, launches the embedded Axum LAN server at `http://0.0.0.0:8080`, builds the Svelte 5 frontend with Vite hot-module replacement (HMR), and presents the native desktop application window.

---

## 5. Production Compilation

To compile self-contained desktop binaries and installers optimized for distribution:

```bash
npm run tauri build
```

The resulting binaries will be located under `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` Windows Installer and `.exe` standalone executable.
- **macOS**: Universal `.dmg` disk image and `.app` bundle.
- **Linux**: Standalone `.AppImage` and `.deb` packages.

---

## 6. Local Area Network (LAN) Play Setup

Hosting a game session with your players around a table requires only a shared local Wi-Fi or mobile hotspot connection:

```
[ DM Desktop Workstation ] ── (Port 8080 TCP) ──► [ Local Wi-Fi Network ]
                                                           │
                      ┌────────────────────────────────────┼────────────────────────────────────┐
                      ▼                                    ▼                                    ▼
           [ Player 1: iPhone ]                 [ Player 2: Android ]                [ Player 3: Tablet ]
         http://192.168.1.145:8080            http://192.168.1.145:8080            http://192.168.1.145:8080
```

1. **Obtain Local IPv4**:
   - **Windows**: Run `ipconfig` in Command Prompt.
   - **macOS**: Run `ipconfig getifaddr en0` in Terminal.
   - **Linux**: Run `hostname -I | awk '{print $1}'` in Terminal.
2. **Permit Port 8080 Inbound**:
   - Ensure the host operating system's firewall permits incoming connections on TCP port `8080`. (See detailed instructions in [docs/LAN_NETWORKING_GUIDE.md](docs/LAN_NETWORKING_GUIDE.md)).
3. **Player Onboarding**:
   - Instruct players to connect their devices to the host's Wi-Fi network.
   - Players open their browser and navigate to:
     ```
     http://<HOST_IPV4>:8080
     ```
   - Players select their character and enter their private 4-digit PIN.

---

## 7. Project Documentation

Comprehensive architectural blueprints, API contracts, and troubleshooting manuals are located in the `docs/` directory:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Deep-dive into Tauri 2 IPC, embedded Axum concurrency, SQLite migrations, PixiJS v8 raycasting geometry, and LanceDB RAG.
- [docs/LAN_NETWORKING_GUIDE.md](docs/LAN_NETWORKING_GUIDE.md): Practical networking guide, firewall configuration commands, Wi-Fi client isolation workarounds, and connection diagnostics.
- [CONTRIBUTING.md](CONTRIBUTING.md): Contribution workflow, code formatting standards, testing commands, and strict Bring-Your-Own-Content (BYOC) compliance policies.

---

## 8. Legal Attribution & Licensing

### Software Engine License
The source code, build scripts, rendering architecture, and embedded server software of this workstation are licensed under the **MIT License**. See the [LICENSE](LICENSE) file for complete terms.

```
MIT License
Copyright (c) 2026 D&D 5e/5.5e VTT Workstation Contributors
```

### Game System Rules Attribution
- This software incorporates rules, stat blocks, spells, and game mechanics from the **Systems Reference Document 5.1 (SRD 5.1)** and **Systems Reference Document 5.2 (SRD 5.2)** published by Wizards of the Coast LLC.
- The SRD 5.1 and SRD 5.2 are licensed under the **Creative Commons Attribution 4.0 International License (CC-BY-4.0)**, available at [https://creativecommons.org/licenses/by/4.0/legalcode](https://creativecommons.org/licenses/by/4.0/legalcode).
- Wizards of the Coast, Dungeons & Dragons, and their respective logos are trademarks of Wizards of the Coast LLC in the USA and other countries. This workstation is not endorsed by, sponsored by, or affiliated with Wizards of the Coast.