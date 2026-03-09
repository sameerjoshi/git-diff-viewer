# CLAUDE.md — Git Diff Viewer

## Overview
Minimal Electron app for read-only git diff viewing. No write operations (commit, push, etc.).

## Architecture
- **main.js** — Electron main process. Handles: window lifecycle, folder dialog, git status/diff via `simple-git`, recent repos persistence, window state persistence. All IPC handlers live here.
- **preload.js** — Context bridge. Exposes `window.gitAPI` to renderer with 5 methods.
- **index.html** — Single-file renderer. Contains all markup, CSS, and JS. No framework, no build step.

## Conventions
- No build tooling for renderer code — keep it as plain HTML/JS/CSS in `index.html`
- `contextIsolation: true`, `nodeIntegration: false` — all Node access goes through preload
- User data (recent repos, window state) stored in Electron's `userData` directory as JSON files
- GitHub light theme color palette (`:root` CSS variables)

## Commands
- `npm start` — run in dev mode
- `npm run build` — build `.deb` package via electron-builder

## Package manager
- npm (lockfile: `package-lock.json`)

## Key decisions
- `electron` is a devDependency (electron-builder bundles its own copy for packaging)
- `simple-git` is the only runtime dependency
- Window state tracked via resize/move/maximize events (not just on close) to avoid Linux focus quirks
