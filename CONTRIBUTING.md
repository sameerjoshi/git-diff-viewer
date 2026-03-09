# Contributing to Git Diff Viewer

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/sameerjoshi/git-diff-viewer.git
cd git-diff-viewer
npm install
npm start
```

## Development

There's no build step for the renderer — edit `index.html` directly and reload the app (`Ctrl+R` / `Cmd+R`) to see changes. Changes to `main.js` or `preload.js` require restarting the app.

### Architecture

- **main.js** — Electron main process (git operations, file watching, IPC handlers)
- **preload.js** — Context bridge exposing `window.gitAPI` to the renderer
- **index.html** — All UI code (markup, CSS, JS) in a single file

All Node.js / git operations happen in the main process. The renderer communicates exclusively through `window.gitAPI`.

## Building

| Platform | Command |
|----------|---------|
| Linux (.deb) | `npm run build` |
| macOS (.dmg) | `npm run build:mac` |
| Windows (.exe) | `npm run build:win` |

Note: cross-platform builds may require additional tools. See the [electron-builder docs](https://www.electron.build/multi-platform-build) for details.

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes — keep diffs small and focused
3. Test by running the app against a real git repository
4. Open a pull request with a clear description of what changed and why

## Code Style

- Vanilla JS, no frameworks or build tools for the renderer
- Keep all renderer code in `index.html`
- Follow existing patterns for IPC handlers (return `{ ok }` or `{ error }` objects)
- CSS uses the `:root` variables for theming — don't hardcode colors

## Reporting Issues

Use [GitHub Issues](https://github.com/sameerjoshi/git-diff-viewer/issues). Include:
- What you expected vs what happened
- Steps to reproduce
- OS and Electron version (`Help > About` or `process.versions`)
