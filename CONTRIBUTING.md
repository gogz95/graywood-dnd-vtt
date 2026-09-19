# Contributing Guidelines

Thank you for your interest in contributing to the generic D&D 5e / 5.5e Virtual Tabletop (VTT) Desktop Workstation. This project is dedicated to providing an offline-first, zero-subscription, local LAN workstation for tabletop roleplaying groups.

To preserve stability, code quality, and strict legal compliance, all contributors must adhere to the engineering guidelines, licensing protocols, and verification standards outlined in this document.

---

## 1. Development Environment Prerequisites

Ensure your local development machine satisfies the following prerequisites before contributing:

### 1.1 Rust Toolchain
- **Channel**: Stable (Rust 1.78.0 or later).
- **Components**: `cargo`, `rustc`, `rustfmt`, and `clippy`.
- **Installation**:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  rustup update stable
  rustup component add rustfmt clippy
  ```

### 1.2 Node.js & Package Manager
- **Node.js**: LTS version (v20.x or later).
- **NPM**: Version 10.x or later (bundled with Node.js LTS).
- **Verify installation**:
  ```bash
  node --version
  npm --version
  ```

### 1.3 Native Desktop Build Dependencies (Tauri 2)
Depending on your host operating system, the following native system packages are required:

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
- Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

#### Windows
- Microsoft Visual Studio C++ Build Tools (with the "Desktop development with C++" workload selected).
- WebView2 Runtime (pre-installed on modern Windows 10 and Windows 11 systems).

### 1.4 Local AI Inference (Optional / Recommended for RAG Engine)
- **Engine**: Local Ollama instance for offline rule retrieval and referee assistance.
- **Model**: `qwen2.5:7b` (recommended default) or equivalent low-latency instruction-tuned model.
- **Setup**:
  ```bash
  ollama serve
  ollama pull qwen2.5:7b
  ```

---

## 2. Branching Conventions & Commit Standards

We enforce a clean git history with structured branching and semantic versioning.

### 2.1 Branch Naming Conventions
Always branch from the latest `main` branch using one of the following prefixes:

- `feature/<short-description>`: New functional capabilities (e.g., `feature/dynamic-lighting-polygon`).
- `fix/<short-description>`: Defect repairs or bug fixes (e.g., `fix/turn-order-hp-desync`).
- `perf/<short-description>`: Performance and memory optimizations (e.g., `perf/pixi-container-batching`).
- `refactor/<short-description>`: Code structure changes without functional modifications.
- `docs/<short-description>`: Architecture or user-facing documentation updates.
- `chore/<short-description>`: Dependency updates, build script adjustments, or CI maintenance.

### 2.2 Commit Message Standards (Conventional Commits)
All commit messages must follow the [Conventional Commits specification](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short imperative summary>

[optional detailed body explaining why this change was made]

[optional footer(s) referencing issue numbers]
```

#### Valid Types:
- `feat`: A new feature for the application or API.
- `fix`: A bug fix.
- `docs`: Documentation-only changes.
- `style`: Changes that do not affect the meaning of the code (white-space, formatting).
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `perf`: A code change that improves performance.
- `test`: Adding missing tests or correcting existing tests.
- `ci`: Changes to CI/CD workflows and configuration scripts.
- `chore`: Maintenance tasks, dependencies, or tooling adjustments.

#### Example Commit:
```
feat(combat): implement 2024 death saving throw auto-counter

Track natural 20 rolls as immediate recovery of 1 hit point, and natural 1
rolls as two immediate death saving throw failures in accordance with SRD 5.2.

Closes #42
```

---

## 3. Verification Steps Before Submitting

Every Pull Request must pass all automated verification checks locally before being submitted for review:

### Step 1: Rust Code Formatting
Ensure all backend code complies with the official Rust style guide:
```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```
To automatically apply formatting:
```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
```

### Step 2: Rust Linting & Static Analysis
Check for common idioms, bugs, and performance anti-patterns:
```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

### Step 3: Rust Unit & Integration Tests
Execute the comprehensive test suite across SQLite models, Axum routes, and combat systems:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### Step 4: Frontend Type Checking & Compilation
Verify that Svelte components, TypeScript stores, and PixiJS canvas pipelines typecheck cleanly:
```bash
npm run check
```

### Step 5: Frontend Linting
Ensure frontend scripts conform to strict type safety:
```bash
npm run lint
```

---

## 4. Bring-Your-Own-Content (BYOC) Compliance Policy

To protect both open-source contributors and users from intellectual property infringement, this repository enforces a strict, zero-tolerance Bring-Your-Own-Content (BYOC) policy:

1. **SRD Content Only**:
   - Only game rules, classes, races, spells, stat blocks, and equipment that are explicitly published in the **Systems Reference Document (SRD 5.1 / SRD 5.2)** under the Creative Commons Attribution 4.0 International License (CC-BY-4.0) or Open Game License (OGL 1.0a) may be included in the default codebase or test fixtures.

2. **No Proprietary Intellectual Property**:
   - Do NOT commit proprietary campaign settings, trade dress, trademarks, product identities, or copyrighted descriptions from commercial sourcebooks (e.g., Wizards of the Coast, Paizo, or other publishers).
   - Omit all proprietary lore, NPC names, deities, and locations outside the public SRD definitions.

3. **No Campaign Lore or Homebrew Terminology**:
   - All models, tests, schemas, and UI components must remain completely generic and reference-less. Use standard SRD 5e/5.5e mechanical terms (`Character`, `Monster`, `Spell`, `Item`, `Encounter`, `Condition`).
   - Custom campaigns, homebrew settings, and personal game data must be loaded dynamically at runtime via the user's local database or campaign export archives, never checked into version control.

4. **License Compatibility**:
   - All software source code is licensed under the **MIT License**.
   - By submitting a Pull Request, you certify that you have the right to license your contribution under the MIT License and that your submission contains no copyrighted third-party material without appropriate open-source licensing.

---

## 5. Pull Request Process

1. Fork the repository and create your feature branch from `main`.
2. Implement your changes, ensuring no debug artifacts, dead code, or temporary comments remain.
3. Run all verification commands specified in Section 3.
4. Push your branch to your fork and submit a Pull Request to the `main` branch.
5. Provide a comprehensive summary in the PR description detailing:
   - What changed and why.
   - Any modifications to database migrations or Axum API schemas.
   - Confirmation that all automated tests pass across supported platforms.
6. Address any reviewer feedback promptly. Once approved and CI checks pass, your PR will be squashed and merged.
