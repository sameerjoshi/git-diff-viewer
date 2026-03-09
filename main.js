const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const chokidar = require('chokidar');

app.setName('Git Diff Viewer');

let repoWatcher = null;
let gitWatcher = null;
let watchDebounce = null;

function notifyFilesChanged() {
  clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('repo-files-changed');
    }
  }, 500);
}

function watchRepo(repoPath) {
  // Stop previous watchers
  if (repoWatcher) { repoWatcher.close(); repoWatcher = null; }
  if (gitWatcher) { gitWatcher.close(); gitWatcher = null; }

  // Watch working tree (ignore .git and node_modules)
  repoWatcher = chokidar.watch(repoPath, {
    ignored: [
      /(^|[/\\])\.git[/\\]/,
      /(^|[/\\])node_modules[/\\]/,
    ],
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });
  repoWatcher.on('all', notifyFilesChanged);

  // Watch key git files — these change on commits, staging, branch switches
  const gitDir = path.join(repoPath, '.git');
  gitWatcher = chokidar.watch([
    path.join(gitDir, 'HEAD'),          // branch switches
    path.join(gitDir, 'index'),         // staging / commits
    path.join(gitDir, 'refs'),          // new commits, branch creation
    path.join(gitDir, 'MERGE_HEAD'),    // merge state
  ], {
    ignoreInitial: true,
    persistent: true,
  });
  gitWatcher.on('all', notifyFilesChanged);
}

const RECENT_REPOS_FILE = path.join(app.getPath('userData'), 'recent-repos.json');
const MAX_RECENT = 10;

function loadRecentRepos() {
  try {
    return JSON.parse(fs.readFileSync(RECENT_REPOS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function addRecentRepo(repoPath) {
  let recent = loadRecentRepos();
  // Remove if already exists, then prepend
  recent = recent.filter((r) => r !== repoPath);
  recent.unshift(repoPath);
  if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
  fs.writeFileSync(RECENT_REPOS_FILE, JSON.stringify(recent, null, 2));
  return recent;
}

const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf-8'));
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

let windowState;
let saveTimeout;
let mainWindow;

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(windowState));
}

function trackWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const isMaximized = mainWindow.isMaximized();
  const isFullScreen = mainWindow.isFullScreen();

  // Only update bounds when in normal (non-maximized, non-fullscreen) state
  if (!isMaximized && !isFullScreen) {
    const bounds = mainWindow.getBounds();
    windowState.x = bounds.x;
    windowState.y = bounds.y;
    windowState.width = bounds.width;
    windowState.height = bounds.height;
  }
  windowState.isMaximized = isMaximized;
  windowState.isFullScreen = isFullScreen;

  // Debounce writes
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveWindowState, 500);
}

function createWindow() {
  windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (windowState.isFullScreen) {
    mainWindow.setFullScreen(true);
  } else if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('resize', trackWindowState);
  mainWindow.on('move', trackWindowState);
  mainWindow.on('maximize', trackWindowState);
  mainWindow.on('unmaximize', trackWindowState);
  mainWindow.on('enter-full-screen', trackWindowState);
  mainWindow.on('leave-full-screen', trackWindowState);
  mainWindow.on('close', saveWindowState);

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (repoWatcher) repoWatcher.close();
  if (gitWatcher) gitWatcher.close();
  app.quit();
});

// Open folder dialog
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selected = result.filePaths[0];
  addRecentRepo(selected);
  return selected;
});

// Recent repos
ipcMain.handle('get-recent-repos', () => loadRecentRepos());

ipcMain.handle('remove-recent-repo', (_event, repoPath) => {
  let recent = loadRecentRepos();
  recent = recent.filter((r) => r !== repoPath);
  fs.writeFileSync(RECENT_REPOS_FILE, JSON.stringify(recent, null, 2));
  return recent;
});

// Get all local branches
ipcMain.handle('get-branches', async (_event, repoPath) => {
  try {
    const git = simpleGit(repoPath);
    const result = await git.branchLocal();
    return { current: result.current, branches: result.all };
  } catch (err) {
    return { error: err.message };
  }
});

// Create a new branch and switch to it
ipcMain.handle('create-branch', async (_event, repoPath, branchName) => {
  try {
    const git = simpleGit(repoPath);
    await git.checkoutLocalBranch(branchName);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Switch branch — aborts if dirty state would conflict
ipcMain.handle('switch-branch', async (_event, repoPath, branchName) => {
  try {
    const git = simpleGit(repoPath);
    await git.checkout(branchName);
    return { ok: true };
  } catch (err) {
    const msg = err.message || '';
    // Git's error message for conflicts is clear enough to show directly
    if (msg.includes('Your local changes') || msg.includes('overwritten by checkout')) {
      return { error: 'Cannot switch branches: you have uncommitted changes that would be overwritten.\n\nPlease commit or stash your changes before switching.' };
    }
    return { error: msg };
  }
});

// Check if repo has at least one commit
async function hasCommits(git) {
  try {
    await git.log(['-1']);
    return true;
  } catch {
    return false;
  }
}

// Stage or unstage a file
ipcMain.handle('stage-file', async (_event, repoPath, filePath, stage) => {
  try {
    const git = simpleGit(repoPath);
    if (stage) {
      await git.add(filePath);
    } else {
      if (await hasCommits(git)) {
        await git.reset(['HEAD', '--', filePath]);
      } else {
        await git.raw(['rm', '--cached', filePath]);
      }
    }
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Stage all or unstage all
ipcMain.handle('stage-all', async (_event, repoPath, stage) => {
  try {
    const git = simpleGit(repoPath);
    if (stage) {
      await git.add('-A');
    } else {
      if (await hasCommits(git)) {
        await git.reset(['HEAD']);
      } else {
        await git.raw(['rm', '-r', '--cached', '.']);
      }
    }
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Commit staged files
ipcMain.handle('commit', async (_event, repoPath, message) => {
  try {
    const git = simpleGit(repoPath);
    const result = await git.commit(message);
    return { ok: true, summary: result.summary };
  } catch (err) {
    return { error: err.message };
  }
});

// Get changed files (staged + unstaged + untracked)
ipcMain.handle('get-status', async (_event, repoPath) => {
  try {
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { error: 'Not a git repository' };

    const status = await git.status();
    const branch = status.current;

    // Build a de-duplicated file list. Each file appears once.
    // Priority: if a file is staged (even partially), mark it staged.
    const fileMap = new Map();

    const stagedSet = new Set(status.staged);
    const createdSet = new Set(status.created);
    const renamedToSet = new Set(status.renamed.map((r) => r.to));

    // Staged modifications (not created, not renamed — those are handled below)
    for (const f of status.staged) {
      if (!createdSet.has(f) && !renamedToSet.has(f)) {
        fileMap.set(f, { path: f, status: 'modified', staged: true });
      }
    }

    // Unstaged modifications — only add if not already tracked as staged
    for (const f of status.modified) {
      if (!fileMap.has(f)) {
        fileMap.set(f, { path: f, status: 'modified', staged: false });
      }
    }

    // Untracked files
    for (const f of status.not_added) {
      if (!fileMap.has(f)) {
        fileMap.set(f, { path: f, status: 'untracked', staged: false });
      }
    }

    // Deleted files
    for (const f of status.deleted) {
      if (!fileMap.has(f)) {
        fileMap.set(f, { path: f, status: 'deleted', staged: stagedSet.has(f) });
      }
    }

    // Renamed files
    for (const r of status.renamed) {
      const key = `${r.from} → ${r.to}`;
      if (!fileMap.has(key)) {
        fileMap.set(key, { path: key, status: 'renamed', staged: true });
      }
    }

    // Created (staged new files)
    for (const f of status.created) {
      if (!fileMap.has(f)) {
        fileMap.set(f, { path: f, status: 'new', staged: true });
      }
    }

    const files = Array.from(fileMap.values());

    // Start watching this repo for file changes
    watchRepo(repoPath);

    return { branch, files };
  } catch (err) {
    return { error: err.message };
  }
});

// Get diff for a specific file
ipcMain.handle('get-diff', async (_event, repoPath, filePath, staged) => {
  try {
    const git = simpleGit(repoPath);

    let diff;
    if (staged) {
      diff = await git.diff(['--cached', '--', filePath]);
    } else {
      diff = await git.diff(['--', filePath]);
    }

    // For untracked files, show the full content
    if (!diff) {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Format as a unified diff for new files
        const lines = content.split('\n');
        diff = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
        diff += lines.map((l) => `+${l}`).join('\n');
      } catch {
        diff = '(binary or unreadable file)';
      }
    }

    return { diff };
  } catch (err) {
    return { error: err.message };
  }
});
