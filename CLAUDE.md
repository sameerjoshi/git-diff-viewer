@import .codepakt/CLAUDE.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Minimal Electron desktop app (GitHub Desktop-style) for git diff viewing, staging, committing, and branch management. No framework, no build step for renderer code.

## Commands
- `npm start` — run the app in dev mode (`electron .`)
- `npm test` — run unit tests (Jest)
- `npm run test:watch` — run tests in watch mode
- `npm run build` — build Linux `.deb` package
- `npm run build:mac` — build macOS `.dmg` package
- `npm run build:win` — build Windows `.exe` installer

## Package Manager
npm (lockfile: `package-lock.json`). Do not introduce other package managers.

## Architecture

Three files, strict Electron process separation:

```
main.js        → Main process: Electron wiring, IPC handlers, file watching (chokidar)
git-helpers.js → Pure business logic extracted for testability (file status dedup,
                 recent repos, window state, synthetic diffs, error formatting)
preload.js     → Context bridge: exposes window.gitAPI (12 methods + 1 event listener)
index.html     → Single-file renderer: ALL markup, CSS, and JS in one file
```

**Data flow:** Renderer calls `window.gitAPI.*` → preload forwards via `ipcRenderer.invoke` → main.js handles with `ipcMain.handle` → returns `{ ok, data }` or `{ error }` objects.

**File watching:** `get-status` call triggers `watchRepo()` which sets up two chokidar watchers (working tree + `.git/` internals). Changes push `repo-files-changed` event to renderer, which re-fetches status.

**State:** Renderer holds all UI state in module-scoped variables (`currentRepo`, `currentFiles`, `currentBranch`). No state management library.

## IPC Handlers (main.js)
- `open-folder` — native folder picker, saves to recent repos
- `get-recent-repos` / `remove-recent-repo` — recent repos CRUD
- `get-status` — file status (modified, staged, untracked, deleted, renamed, new) + starts file watcher
- `get-diff` — unified diff for a file (staged or unstaged); falls back to raw file read for untracked
- `get-branches` / `create-branch` / `switch-branch` — branch management
- `stage-file` / `stage-all` — stage/unstage individual or all files
- `commit` — commit staged files with message
- `repo-files-changed` — push event from main to renderer on filesystem changes

## Conventions
- Keep renderer as plain HTML/JS/CSS in `index.html` — no build tooling, no framework
- `contextIsolation: true`, `nodeIntegration: false` — all Node access goes through preload
- User data (recent repos, window state) stored as JSON in Electron's `userData` directory
- GitHub light theme color palette via `:root` CSS variables
- De-duplicated file status: each file appears once using a Map keyed by path
- All IPC handlers return plain objects (`{ ok }`, `{ error }`, or data objects) — no thrown exceptions cross the IPC boundary

## Key Decisions
- `electron` is a devDependency (electron-builder bundles its own copy)
- `simple-git` and `chokidar` are the only runtime dependencies
- Window state tracked via resize/move/maximize events (not just on close) to avoid Linux focus quirks
- File watcher ignores `.git/` and `node_modules/`, debounces at 500ms
- Unstaging on repos with no commits uses `git rm --cached` instead of `git reset HEAD`
- Branch creation uses `checkoutLocalBranch` (create + switch in one step)
- Untracked file diffs are synthesized by reading the file and formatting as unified diff
