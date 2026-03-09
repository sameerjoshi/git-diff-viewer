# CLAUDE.md — Git Diff Viewer

## Overview
Minimal Electron desktop app (GitHub Desktop-style) for git diff viewing, staging, committing, and branch management.

## Architecture
- **main.js** — Electron main process. Handles: window lifecycle, folder dialog, git operations via `simple-git` (status, diff, stage, commit, branches), recent repos persistence, window state persistence, file watching via `chokidar`. All IPC handlers live here.
- **preload.js** — Context bridge. Exposes `window.gitAPI` to renderer with 12 methods + 1 event listener.
- **index.html** — Single-file renderer. Contains all markup, CSS, and JS. No framework, no build step.

## IPC Handlers (main.js)
- `open-folder` — native folder picker, saves to recent repos
- `get-recent-repos` / `remove-recent-repo` — recent repos CRUD
- `get-status` — file status (modified, staged, untracked, deleted, renamed, new) + starts file watcher
- `get-diff` — unified diff for a file (staged or unstaged)
- `get-branches` — list local branches
- `create-branch` — create + checkout new branch
- `switch-branch` — checkout existing branch (aborts on conflicts)
- `stage-file` — stage or unstage a single file (handles repos with no commits)
- `stage-all` — stage all or unstage all
- `commit` — commit staged files with message
- `repo-files-changed` — event pushed to renderer when chokidar detects changes

## Conventions
- No build tooling for renderer code — keep it as plain HTML/JS/CSS in `index.html`
- `contextIsolation: true`, `nodeIntegration: false` — all Node access goes through preload
- User data (recent repos, window state) stored in Electron's `userData` directory as JSON files
- GitHub light theme color palette (`:root` CSS variables)
- De-duplicated file status: each file appears once using a Map keyed by path

## Commands
- `npm start` — run in dev mode
- `npm run build` — build `.deb` package via electron-builder

## Package manager
- npm (lockfile: `package-lock.json`)

## Key decisions
- `electron` is a devDependency (electron-builder bundles its own copy for packaging)
- `simple-git` and `chokidar` are the runtime dependencies
- Window state tracked via resize/move/maximize events (not just on close) to avoid Linux focus quirks
- File watcher ignores `.git/` and `node_modules/`, debounces at 500ms
- Unstaging on repos with no commits uses `git rm --cached` instead of `git reset HEAD`
- Branch creation uses `checkoutLocalBranch` (create + switch in one step)
