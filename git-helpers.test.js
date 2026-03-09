const fs = require('fs');
const path = require('path');
const os = require('os');
const {
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
} = require('./git-helpers');

// --- buildFileList ---

describe('buildFileList', () => {
  function makeStatus(overrides = {}) {
    return {
      staged: [],
      modified: [],
      not_added: [],
      deleted: [],
      renamed: [],
      created: [],
      ...overrides,
    };
  }

  test('returns empty array for clean status', () => {
    const files = buildFileList(makeStatus());
    expect(files).toEqual([]);
  });

  test('unstaged modified files', () => {
    const files = buildFileList(makeStatus({ modified: ['a.js', 'b.js'] }));
    expect(files).toEqual([
      { path: 'a.js', status: 'modified', staged: false },
      { path: 'b.js', status: 'modified', staged: false },
    ]);
  });

  test('staged modified files', () => {
    const files = buildFileList(makeStatus({ staged: ['a.js'] }));
    expect(files).toEqual([
      { path: 'a.js', status: 'modified', staged: true },
    ]);
  });

  test('staged takes priority over unstaged for same file', () => {
    const files = buildFileList(makeStatus({
      staged: ['a.js'],
      modified: ['a.js'],
    }));
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ path: 'a.js', status: 'modified', staged: true });
  });

  test('untracked files', () => {
    const files = buildFileList(makeStatus({ not_added: ['new.txt'] }));
    expect(files).toEqual([
      { path: 'new.txt', status: 'untracked', staged: false },
    ]);
  });

  test('deleted files (unstaged)', () => {
    const files = buildFileList(makeStatus({ deleted: ['old.js'] }));
    expect(files).toEqual([
      { path: 'old.js', status: 'deleted', staged: false },
    ]);
  });

  test('deleted files (staged)', () => {
    const files = buildFileList(makeStatus({
      staged: ['old.js'],
      deleted: ['old.js'],
    }));
    // staged handles it as 'modified' first since it's in staged but not created/renamed
    // then deleted won't add a duplicate
    expect(files).toHaveLength(1);
    expect(files[0].staged).toBe(true);
  });

  test('renamed files', () => {
    const files = buildFileList(makeStatus({
      renamed: [{ from: 'old.js', to: 'new.js' }],
    }));
    expect(files).toEqual([
      { path: 'old.js → new.js', status: 'renamed', staged: true },
    ]);
  });

  test('created (new staged) files', () => {
    const files = buildFileList(makeStatus({ created: ['fresh.js'] }));
    expect(files).toEqual([
      { path: 'fresh.js', status: 'new', staged: true },
    ]);
  });

  test('created file in staged list is treated as new, not modified', () => {
    const files = buildFileList(makeStatus({
      staged: ['fresh.js'],
      created: ['fresh.js'],
    }));
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('new');
  });

  test('renamed file in staged list is treated as renamed, not modified', () => {
    const files = buildFileList(makeStatus({
      staged: ['new.js'],
      renamed: [{ from: 'old.js', to: 'new.js' }],
    }));
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('renamed');
  });

  test('deduplicates across all categories', () => {
    const files = buildFileList(makeStatus({
      staged: ['a.js'],
      modified: ['a.js', 'b.js'],
      not_added: ['c.js'],
      deleted: ['d.js'],
      renamed: [{ from: 'e.js', to: 'f.js' }],
      created: ['g.js'],
    }));
    const paths = files.map((f) => f.path);
    // a.js appears once (staged priority), b.js, c.js, d.js, rename, g.js
    expect(paths).toEqual(['a.js', 'b.js', 'c.js', 'd.js', 'e.js → f.js', 'g.js']);
    expect(files).toHaveLength(6);
  });

  test('multiple renames are all included', () => {
    const files = buildFileList(makeStatus({
      renamed: [
        { from: 'a.js', to: 'b.js' },
        { from: 'c.js', to: 'd.js' },
      ],
    }));
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('a.js → b.js');
    expect(files[1].path).toBe('c.js → d.js');
  });
});

// --- buildSyntheticDiff ---

describe('buildSyntheticDiff', () => {
  test('formats single-line file as unified diff', () => {
    const diff = buildSyntheticDiff('hello.txt', 'hello world');
    expect(diff).toContain('--- /dev/null');
    expect(diff).toContain('+++ b/hello.txt');
    expect(diff).toContain('@@ -0,0 +1,1 @@');
    expect(diff).toContain('+hello world');
  });

  test('formats multi-line file', () => {
    const diff = buildSyntheticDiff('multi.txt', 'line1\nline2\nline3');
    expect(diff).toContain('@@ -0,0 +1,3 @@');
    expect(diff).toContain('+line1');
    expect(diff).toContain('+line2');
    expect(diff).toContain('+line3');
  });

  test('handles empty file', () => {
    const diff = buildSyntheticDiff('empty.txt', '');
    expect(diff).toContain('@@ -0,0 +1,1 @@');
    expect(diff).toContain('+');
  });

  test('preserves file path in header', () => {
    const diff = buildSyntheticDiff('src/deep/path.js', 'code');
    expect(diff).toContain('+++ b/src/deep/path.js');
  });
});

// --- formatSwitchBranchError ---

describe('formatSwitchBranchError', () => {
  test('formats "Your local changes" error', () => {
    const result = formatSwitchBranchError('error: Your local changes to the following files would be overwritten');
    expect(result).toContain('Cannot switch branches');
    expect(result).toContain('commit or stash');
  });

  test('formats "overwritten by checkout" error', () => {
    const result = formatSwitchBranchError('error: overwritten by checkout');
    expect(result).toContain('Cannot switch branches');
  });

  test('passes through other errors unchanged', () => {
    const result = formatSwitchBranchError('pathspec "foo" did not match');
    expect(result).toBe('pathspec "foo" did not match');
  });

  test('handles undefined/null message', () => {
    expect(formatSwitchBranchError(undefined)).toBe('');
    expect(formatSwitchBranchError(null)).toBe('');
    expect(formatSwitchBranchError('')).toBe('');
  });
});

// --- Recent repos (file-based) ---

describe('recent repos', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-recent-${Date.now()}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('loadRecentRepos returns [] when file does not exist', () => {
    expect(loadRecentRepos('/nonexistent/path.json')).toEqual([]);
  });

  test('loadRecentRepos returns [] for corrupt JSON', () => {
    fs.writeFileSync(tmpFile, 'not json!!!');
    expect(loadRecentRepos(tmpFile)).toEqual([]);
  });

  test('loadRecentRepos reads valid file', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(['/repo1', '/repo2']));
    expect(loadRecentRepos(tmpFile)).toEqual(['/repo1', '/repo2']);
  });

  test('addRecentRepo prepends to empty list', () => {
    const result = addRecentRepo(tmpFile, '/my/repo');
    expect(result).toEqual(['/my/repo']);
    expect(JSON.parse(fs.readFileSync(tmpFile, 'utf-8'))).toEqual(['/my/repo']);
  });

  test('addRecentRepo prepends and deduplicates', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(['/a', '/b', '/c']));
    const result = addRecentRepo(tmpFile, '/b');
    expect(result).toEqual(['/b', '/a', '/c']);
  });

  test('addRecentRepo caps at MAX_RECENT', () => {
    const repos = Array.from({ length: 12 }, (_, i) => `/repo${i}`);
    fs.writeFileSync(tmpFile, JSON.stringify(repos));
    const result = addRecentRepo(tmpFile, '/new');
    expect(result).toHaveLength(MAX_RECENT);
    expect(result[0]).toBe('/new');
  });

  test('removeRecentRepo removes and persists', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(['/a', '/b', '/c']));
    const result = removeRecentRepo(tmpFile, '/b');
    expect(result).toEqual(['/a', '/c']);
    expect(JSON.parse(fs.readFileSync(tmpFile, 'utf-8'))).toEqual(['/a', '/c']);
  });

  test('removeRecentRepo with nonexistent path is a no-op', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(['/a', '/b']));
    const result = removeRecentRepo(tmpFile, '/nope');
    expect(result).toEqual(['/a', '/b']);
  });
});

// --- loadWindowState ---

describe('loadWindowState', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-winstate-${Date.now()}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('returns defaults when file does not exist', () => {
    const state = loadWindowState('/nonexistent/path.json');
    expect(state).toEqual(DEFAULT_WINDOW_STATE);
  });

  test('returns defaults for corrupt JSON', () => {
    fs.writeFileSync(tmpFile, '{bad json');
    expect(loadWindowState(tmpFile)).toEqual(DEFAULT_WINDOW_STATE);
  });

  test('reads saved state', () => {
    const saved = { width: 800, height: 600, x: 100, y: 50, isMaximized: true };
    fs.writeFileSync(tmpFile, JSON.stringify(saved));
    expect(loadWindowState(tmpFile)).toEqual(saved);
  });

  test('returned default is a fresh object each time', () => {
    const a = loadWindowState('/no/file');
    const b = loadWindowState('/no/file');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// --- hasCommits ---

describe('hasCommits', () => {
  test('returns true when git.log succeeds', async () => {
    const git = { log: jest.fn().mockResolvedValue({}) };
    expect(await hasCommits(git)).toBe(true);
    expect(git.log).toHaveBeenCalledWith(['-1']);
  });

  test('returns false when git.log throws (no commits)', async () => {
    const git = { log: jest.fn().mockRejectedValue(new Error('no commits')) };
    expect(await hasCommits(git)).toBe(false);
  });
});
