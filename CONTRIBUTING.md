# Contributing to Graywood VTT

Thank you for contributing to **Graywood VTT**! This project provides an offline-first, zero-subscription, local LAN desktop workstation for tabletop roleplaying groups.

To preserve stability, code quality, and strict legal compliance, all contributors must adhere to the engineering guidelines, licensing protocols, and verification standards outlined in this document.

---

## 1. Development Environment Prerequisites

Ensure your local development machine satisfies the following prerequisites before contributing:

### 1.1 Rust Toolchain
- **Channel**: Stable (Rust 1.85.0 or later).
- **Components**: `cargo`, `rustc`, `rustfmt`, and `clippy`.
- **Installation**:
  ```bash
  rustup update stable
  rustup component add rustfmt clippy
  ```

### 1.2 Node.js & Package Manager
- **Node.js**: Version `>=22.0.0` (LTS recommended).
- **NPM**: Version 10.x or later (bundled with Node.js).
- **Verification**:
  ```bash
  node --version # Must be >= 22.0.0
  npm --version
  ```

### 1.3 Native Desktop Build Dependencies (Tauri 2)
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Windows**: Microsoft Visual Studio C++ Build Tools ("Desktop development with C++" workload) and WebView2 Runtime.

---

## 2. GitHub Actions CI & Code Standards

The GitHub Actions CI pipeline enforces strict checks on all pull requests using **Node 22** runners:

1. **Rust Formatting**:
   Code must adhere to official Rust formatting rules without deviation:
   ```bash
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   ```
2. **Strict Rust Clippy Validation**:
   Zero clippy warnings are permitted in CI (`-D warnings` enforced):
   ```bash
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   ```
3. **Frontend Diagnostics & Build**:
   Frontend code must compile cleanly with 0 type or build errors:
   ```bash
   npm --prefix frontend run check
   npm --prefix frontend run build
   ```

---

## 3. Branching & Commit Standards

### 3.1 Branch Naming Conventions
Always branch from the latest `main` branch using standard prefixes:
- `feature/<short-description>`: New functional capabilities.
- `fix/<short-description>`: Defect repairs or bug fixes.
- `perf/<short-description>`: Performance and memory optimizations.
- `refactor/<short-description>`: Code structure changes without functional modifications.
- `docs/<short-description>`: Architecture or user-facing documentation updates.
- `chore/<short-description>`: Dependency updates or CI maintenance.

### 3.2 Commit Message Format
All commit messages must adhere to Conventional Commits:
```
<type>(<scope>): <short imperative summary>

[optional detailed body]

[optional footer(s)]
```
*Valid types:* `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `chore`.

---

## 4. Verification Checklist Before Submitting a PR

Run this complete verification sequence locally before opening a pull request:

```bash
# 1. Verify Rust formatting
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

# 2. Run strict Rust clippy analysis
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# 3. Execute Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# 4. Run Svelte 5 / TypeScript typecheck & production build
npm --prefix frontend run check
npm --prefix frontend run build
```

Both `npm --prefix frontend run check` and `npm --prefix frontend run build` must succeed with 0 errors.

---

## 5. Bring-Your-Own-Content (BYOC) Compliance Policy

To protect contributors and users from intellectual property infringement, Graywood VTT enforces a strict Bring-Your-Own-Content (BYOC) policy:

1. **SRD Content Only**:
   Only game mechanics, classes, spells, and stat blocks published under **SRD 5.1 / SRD 5.2 (CC-BY-4.0)** may be included in the repository or default test fixtures.
2. **No Commercial Intellectual Property**:
   Do NOT commit proprietary campaign settings, trade dress, trademarks, or copyrighted text from commercial publications.
3. **Generic Baseline Schemas**:
   All core schemas and components must remain generic 5e/5.5e baseline entities (`Character`, `Monster`, `Spell`, `Item`, `Encounter`). User campaigns and homebrew assets must be loaded dynamically at runtime.
4. **License Compatibility**:
   All contributions are licensed under the **MIT License**.
