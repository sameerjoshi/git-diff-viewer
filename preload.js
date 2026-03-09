const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAPI', {
  onFilesChanged: (callback) => ipcRenderer.on('repo-files-changed', callback),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getStatus: (repoPath) => ipcRenderer.invoke('get-status', repoPath),
  getDiff: (repoPath, filePath, staged) =>
    ipcRenderer.invoke('get-diff', repoPath, filePath, staged),
  getRecentRepos: () => ipcRenderer.invoke('get-recent-repos'),
  removeRecentRepo: (repoPath) => ipcRenderer.invoke('remove-recent-repo', repoPath),
  getBranches: (repoPath) => ipcRenderer.invoke('get-branches', repoPath),
  createBranch: (repoPath, branchName) => ipcRenderer.invoke('create-branch', repoPath, branchName),
  switchBranch: (repoPath, branchName) => ipcRenderer.invoke('switch-branch', repoPath, branchName),
  stageFile: (repoPath, filePath, stage) => ipcRenderer.invoke('stage-file', repoPath, filePath, stage),
  stageAll: (repoPath, stage) => ipcRenderer.invoke('stage-all', repoPath, stage),
  commit: (repoPath, message) => ipcRenderer.invoke('commit', repoPath, message),
});
