# Git Diff Viewer

A minimal, lightweight desktop app for browsing git repositories and viewing file diffs. Built with Electron.

No commit, push, or other write operations — this is a **read-only** diff viewer.

![screenshot](screenshot.png)

## Features

- **Open any git repository** via folder picker or recent repos list
- **View changed files** — modified, staged, untracked, deleted, renamed
- **Unified diff view** with syntax-highlighted additions and deletions
- **Resizable sidebar** — drag the handle to adjust the file list width
- **Recent repositories** — quick access to previously opened repos
- **Window state persistence** — remembers size, position, and maximized state
- **Keyboard shortcut** — `Ctrl+O` to open a repository

## Install

### From `.deb` (Ubuntu/Debian)

Download the latest `.deb` from [Releases](https://github.com/sameerjoshi/git-diff-viewer/releases), then:

```bash
sudo dpkg -i git-diff-viewer_*_amd64.deb
```

### From source

```bash
git clone https://github.com/sameerjoshi/git-diff-viewer.git
cd git-diff-viewer
npm install
npm start
```

## Build

Build a `.deb` package locally:

```bash
npm run build
```

Output: `dist/git-diff-viewer_<version>_amd64.deb`

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [simple-git](https://github.com/steveukx/git-js) — git operations
- Vanilla HTML/CSS/JS — no framework, no build step

## Project Structure

```
├── main.js        # Electron main process (git operations, IPC, window management)
├── preload.js     # Context bridge (secure API exposure to renderer)
├── index.html     # UI (single file: markup, styles, renderer JS)
├── package.json   # Dependencies and build config
└── LICENSE        # MIT
```

## License

[MIT](LICENSE)
