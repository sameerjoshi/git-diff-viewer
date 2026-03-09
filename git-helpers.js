const path = require('path');
const fs = require('fs');

const MAX_RECENT = 10;
const DEFAULT_WINDOW_STATE = { width: 1200, height: 800, isMaximized: false };

/**
 * Build a de-duplicated file list from simple-git status output.
 * Each file appears once. Staged files take priority over unstaged.
 */
function buildFileList(status) {
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

  return Array.from(fileMap.values());
}

/**
 * Build a synthetic unified diff for an untracked file.
 */
function buildSyntheticDiff(filePath, content) {
  const lines = content.split('\n');
  let diff = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
  diff += lines.map((l) => `+${l}`).join('\n');
  return diff;
}

/**
 * Format branch switch errors into user-friendly messages.
 */
function formatSwitchBranchError(errorMessage) {
  const msg = errorMessage || '';
  if (msg.includes('Your local changes') || msg.includes('overwritten by checkout')) {
    return 'Cannot switch branches: you have uncommitted changes that would be overwritten.\n\nPlease commit or stash your changes before switching.';
  }
  return msg;
}

/**
 * Load recent repos from a JSON file. Returns [] on any error.
 */
function loadRecentRepos(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Add a repo to the recent list (dedup, prepend, cap at MAX_RECENT).
 * Persists to disk and returns the updated list.
 */
function addRecentRepo(filePath, repoPath) {
  let recent = loadRecentRepos(filePath);
  recent = recent.filter((r) => r !== repoPath);
  recent.unshift(repoPath);
  if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
  fs.writeFileSync(filePath, JSON.stringify(recent, null, 2));
  return recent;
}

/**
 * Remove a repo from the recent list. Persists and returns updated list.
 */
function removeRecentRepo(filePath, repoPath) {
  let recent = loadRecentRepos(filePath);
  recent = recent.filter((r) => r !== repoPath);
  fs.writeFileSync(filePath, JSON.stringify(recent, null, 2));
  return recent;
}

/**
 * Load window state from a JSON file. Returns defaults on any error.
 */
function loadWindowState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

/**
 * Check if a repo has at least one commit.
 */
async function hasCommits(git) {
  try {
    await git.log(['-1']);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MAX_RECENT,
  DEFAULT_WINDOW_STATE,
  buildFileList,
  buildSyntheticDiff,
  formatSwitchBranchError,
  loadRecentRepos,
  addRecentRepo,
  removeRecentRepo,
  loadWindowState,
  hasCommits,
};
