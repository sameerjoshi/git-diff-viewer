const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const chokidar = require('chokidar');
const {
  buildFileList,
  buildSyntheticDiff,
  formatSwitchBranchError,
  loadRecentRepos,
  addRecentRepo,
  removeRecentRepo,
  loadWindowState: loadWindowStateFromFile,
  hasCommits,
} = require('./git-helpers');

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
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

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
  windowState = loadWindowStateFromFile(WINDOW_STATE_FILE);

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
  addRecentRepo(RECENT_REPOS_FILE, selected);
  return selected;
});

// Recent repos
ipcMain.handle('get-recent-repos', () => loadRecentRepos(RECENT_REPOS_FILE));

ipcMain.handle('remove-recent-repo', (_event, repoPath) => {
  return removeRecentRepo(RECENT_REPOS_FILE, repoPath);
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
    return { error: formatSwitchBranchError(err.message) };
  }
});

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
    const files = buildFileList(status);

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
        diff = buildSyntheticDiff(filePath, content);
      } catch {
        diff = '(binary or unreadable file)';
      }
    }

    return { diff };
  } catch (err) {
    return { error: err.message };
  }
});
