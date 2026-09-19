# System Architecture & Technical Specifications

This document outlines the technical architecture, data contracts, and subsystems comprising the generic, offline-first D&D 5e / 5.5e Virtual Tabletop (VTT) Desktop Workstation.

The system is designed for complete offline operational autonomy with a $0 recurring budget, operating locally without external cloud dependencies, remote servers, or telemetric callbacks.

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

## 1. Tauri 2 Desktop Core & IPC Bridge

The application lifecycle and native host windowing are governed by **Tauri 2**, leveraging Rust for high performance, memory safety, and minimal binary footprint.

### 1.1 Process Architecture
The workstation runs across two distinct execution domains:
1. **Host Native Core (Rust Process)**: Responsible for database I/O, embedded web server lifecycle, cryptographic operations, raw socket handling, and local AI IPC.
2. **Renderer Webview Process (WebKit / WebView2)**: Hosts the Dungeon Master (DM) control interface built on Svelte 5 and the high-performance PixiJS v8 canvas.

### 1.2 Inter-Process Communication (IPC)
Communication between the Svelte 5 frontend and the Rust backend executes via Tauri's asynchronous IPC channel:

- **Command Invocation (`invoke`)**: Serialized JSON request-response protocol across the Webview boundary for synchronous queries and mutations.
- **Event Streaming (`emit` / `listen`)**: Unidirectional pub-sub channel used by the backend to push real-time ambient alerts, combat queue updates, and background worker progress to the DM view.

```
[Renderer / Svelte 5] ── invoke("advance_initiative", payload) ──► [Tauri IPC Handler]
                                                                          │
[Renderer / Svelte 5] ◄── emit("encounter_updated", state) ───────────────┴──► [Rust Core]
```

### 1.3 Security Sandbox & Permissions
- **Scope Restriction**: File system access is strictly scoped to campaign database directories and user-imported battlemap assets.
- **Zero Remote Capabilities**: External URL navigation is disabled at the Webview configuration layer.
- **Content Security Policy (CSP)**:
  ```
  default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:8080 ws://localhost:8080 http://127.0.0.1:8080 ws://127.0.0.1:8080 blob: data:
  ```

---

## 2. Embedded Axum LAN Server (`0.0.0.0:8080`)

To enable local multiplayer without third-party internet servers, Tauri spawns an embedded asynchronous HTTP/WebSocket server running on **Axum 0.7** over a dedicated **Tokio** runtime.

### 2.1 Network Topology & Binding
- **Bind Address**: `0.0.0.0:8080` (accessible to all devices on the local Wi-Fi / Ethernet subnet).
- **Service Stack**:
  - `tower_http::cors::CorsLayer`: Configured for unrestricted local LAN cross-origin asset requests.
  - `axum::extract::ws::WebSocketUpgrade`: High-throughput, bi-directional event stream for live combat synchronization.
  - Static PWA File Router: Distributes the compiled responsive Svelte player client directly to mobile and tablet browsers.

### 2.2 4-Digit PIN Player Authentication
Security on open Wi-Fi networks is handled through an ephemeral 4-digit PIN authentication scheme:
1. **Character Claim Protocol**: When a player visits `http://<DM_IP>:8080`, they select their character from the roster and submit their private 4-digit numeric PIN.
2. **HMAC Token Issuance**: The server evaluates the PIN against the hashed value in the SQLite database. Upon validation, the server issues an HMAC-SHA256 signed session cookie or bearer token.
3. **Session Verification**: Subsequent WebSocket connections (`/ws`) and REST actions (`/api/characters/action`) require the HMAC token. Players can only mutate the hit points, spell slots, and inventory of the character they claimed.

```
Player Browser                     Axum Server (:8080)                     SQLite DB
      │                                     │                                  │
      ├── POST /api/characters/claim ──────►│                                  │
      │   { id: "char-1", pin: "4921" }     ├── Query character record ───────►│
      │                                     │◄── Return stored PIN hash ───────┘
      │                                     │
      │                                     ├── Compute & Verify HMAC
      │◄── 200 OK + Auth Token ─────────────┤
      │                                     │
      ├── GET /ws?token=<Auth Token> ──────►│ (Upgrades to WebSocket)
      │◄── 101 Switching Protocols ─────────┤
```

### 2.3 Concurrent WebSocket Hub (`/ws`)
- Maintains a thread-safe registry of connected player sessions (`Arc<RwLock<HashMap<Uuid, WsSender>>>`).
- **Broadcast Events**: Turn changes, public dice rolls, ambient time advancement, and map token coordinate shifts are broadcast to all connected clients.
- **Targeted Events**: Secret DM whispers, private saving throw prompts, and player-specific character sheet updates are routed exclusively to the owning client session.

---

## 3. Persistence Layer: Embedded SQLite

All campaign data, 5e / 5.5e compendium datasets, dynamic fog-of-war states, and character sheets reside in a local single-file SQLite database (`campaign.db`).

### 3.1 Concurrency & Reliability
- **Journal Mode**: Configured to Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) to allow concurrent read access across multiple Axum request handlers while serializing write operations.
- **Integrity Enforcement**: `PRAGMA foreign_keys = ON;` and `PRAGMA synchronous = NORMAL;`.
- **Busy Timeout**: 5000ms busy handler configured via `rusqlite` to eliminate lock contention during simultaneous dice rolls or multi-target attacks.

### 3.2 Schema Migrations
Database versions are tracked using the SQLite `PRAGMA user_version` register. Migrations execute sequentially during startup in atomic transactions:

```rust
pub fn run_versioned_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    let current_version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    
    if current_version < 1 {
        let tx = conn.transaction()?;
        tx.execute_batch(SCHEMA_V1_INIT)?;
        tx.execute_batch("PRAGMA user_version = 1;")?;
        tx.commit()?;
    }
    
    if current_version < 2 {
        let tx = conn.transaction()?;
        tx.execute_batch(SCHEMA_V2_SRD_2024_RULES)?;
        tx.execute_batch("PRAGMA user_version = 2;")?;
        tx.commit()?;
    }
    
    Ok(())
}
```

### 3.3 Core Table Relational Design

| Table Name | Primary Key | Description |
| :--- | :--- | :--- |
| `characters` | `id (TEXT UUID)` | Player character stats, 4-digit PIN hash, HP, spell slots JSON, and conditions. |
| `encounters` | `id (TEXT UUID)` | Active combat state, current round, initiative order JSON, and lair action tracking. |
| `monsters` | `id (TEXT UUID)` | Standard SRD monster stat blocks, multiattacks, legendary resistances, and CR. |
| `spells` | `id (TEXT UUID)` | SRD 5.1 & 5.5e spell compendium with school, casting time, range, and dice formulas. |
| `battlemaps` | `id (TEXT UUID)` | Map asset references, grid size (feet/pixels), lighting ambient level, and wall segments. |
| `walls` | `id (TEXT UUID)` | Line-of-sight occlusion segments defined by Cartesian endpoints `(x1, y1, x2, y2)`. |

---

## 4. Tactical Dual-Canvas Rendering Pipeline (PixiJS v8)

Tactical map visualization and fog-of-war occlusion are rendered via **PixiJS v8** utilizing WebGL 2 with an automatic WebGPU upgrade path.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           PIXI.JS SCENE CONTAINER                             │
│                                                                               │
│   Layer 0: Background Battlemap Texture (Hardware Clamped Sprite)             │
│   Layer 1: Tactical Grid Graphic (Square / Hexagonal with Snapping Matrix)     │
│   Layer 2: Token Container (Interactive Sprites, HP Gauges, Status Badges)    │
│   Layer 3: Dynamic Fog-of-War Mesh (Raycasted Visibility Polygon Mask)         │
│   Layer 4: DM Operational Overlay (Hidden Tokens, Wall Segments, LOS Handles)  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Dynamic Raycasting & Line-of-Sight
Dynamic field-of-view and line-of-sight occlusion utilize the `visibility-polygon` computational geometry library:
1. **Wall Segment Extraction**: Solid wall segments defined by coordinate pairs `[[x1, y1], [x2, y2]]` are extracted from the active map state.
2. **Radial Sweep Algorithm**: For each active token with vision (e.g., standard 60ft Darkvision or 30ft Torchlight), rays are cast toward all wall endpoints and angled slightly (`±0.00001` radians) to determine unobstructed intersection points.
3. **Polygon Triangulation**: The sorted radial intersections form a 2D convex polygon representing the token's instantaneous visible region.
4. **Fog-of-War Render Mask**:
   - **Explored Fog (Dim)**: Rendered as a persistent semi-opaque dark layer (`alpha: 0.75`) storing historical vision.
   - **Unexplored / Blocked Vision (Opaque)**: Rendered with complete opacity (`alpha: 1.0`), occluding unseen monsters, traps, and secret doors from the player viewport.

```typescript
import computeVisibility from 'visibility-polygon';

export function calculateTokenVisibility(
  tokenX: number,
  tokenY: number,
  sightRadius: number,
  wallSegments: number[][][]
): number[][] {
  const boundaryWalls = [
    [[-sightRadius, -sightRadius], [sightRadius, -sightRadius]],
    [[sightRadius, -sightRadius], [sightRadius, sightRadius]],
    [[sightRadius, sightRadius], [-sightRadius, sightRadius]],
    [[-sightRadius, sightRadius], [-sightRadius, -sightRadius]]
  ];
  
  const relativeWalls = wallSegments.map(wall => [
    [wall[0][0] - tokenX, wall[0][1] - tokenY],
    [wall[1][0] - tokenX, wall[1][1] - tokenY]
  ]);

  const rawPolygon = computeVisibility([0, 0], [...boundaryWalls, ...relativeWalls]);
  return rawPolygon.map(pt => [pt[0] + tokenX, pt[1] + tokenY]);
}
```

---

## 5. Local AI RAG Subsystem (Offline Rule Referee)

To provide immediate, zero-latency rule clarifications without internet access, the workstation integrates a local Retrieval-Augmented Generation (RAG) subsystem.

### 5.1 Technology Components
- **Inference Engine**: Local **Ollama** running on `http://127.0.0.1:11434`.
- **Target LLM**: `qwen2.5:7b` (quantized 4-bit) configured with `temperature: 0.0` to eliminate hallucination and enforce deterministic rules citations.
- **Embedded Vector Store**: **LanceDB**, an embedded serverless vector database stored locally on disk.
- **Embedding Model**: `nomic-embed-text` (running locally via Ollama) to compute high-density 768-dimensional vector representations of SRD rules text.

### 5.2 RAG Execution Pipeline
When a DM or player enters a rule inquiry (e.g., *"How do Grapple rules work under the 2024 SRD?"*):

```
User Query: "How does Grapple work in 2024?"
    │
    ├── 1. Vector Embedding (Local nomic-embed-text)
    │      Query vector [v_0, v_1, ..., v_767]
    │
    ├── 2. Similarity Search (LanceDB Top-K Cosine Distance)
    │      Retrieves 3 most relevant SRD paragraphs:
    │      - "Unarmed Strike: Grapple Condition & Saving Throws"
    │      - "Grappled Condition Effects & Escape DC"
    │
    ├── 3. Strict Context Assembly
    │      System Prompt: "You are an SRD 5.1/5.2 Rules Referee. Answer using ONLY
    │      the provided excerpts. If the excerpt does not say, state unknown."
    │
    └── 4. Deterministic Local Inference (Ollama qwen2.5:7b @ temperature: 0.0)
           Response: Formatted 5.5e mechanical explanation with verbatim SRD citation.
```

### 5.3 Determinism and Zero Cloud Contact
- All embeddings and weights are stored strictly within the user's local application directory.
- The pipeline never transmits telemetry, queries, or campaign narratives to cloud APIs.
- Operates identically whether the host machine is connected to an enterprise network, home Wi-Fi, or completely air-gapped in an offline gaming cabin.
