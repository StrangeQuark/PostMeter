const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace, walkRequests } = require('./models');
const {
  WorkspaceRecoveryError,
  WorkspaceStore,
  defaultWorkspacePath,
  looksLikeNativeWorkspace,
  normalizeWorkspace
} = require('./workspaceStore');

class WorkspaceManager {
  constructor(preferredWorkspacePath = defaultWorkspacePath()) {
    this.preferredWorkspacePath = path.resolve(preferredWorkspacePath);
    this.baseDirectory = path.dirname(this.preferredWorkspacePath);
    this.workspaceExtension = path.extname(this.preferredWorkspacePath) || '.json';
    this.workspaceStem = path.basename(this.preferredWorkspacePath, this.workspaceExtension) || 'workspace';
    this.preferredWorkspaceFilename = path.basename(this.preferredWorkspacePath);
    this.legacyManifestPath = path.join(this.baseDirectory, `${this.workspaceStem}.workspaces.manifest.json`);
    this.currentWorkspaceId = this.preferredWorkspaceFilename;
    this.currentWorkspacePath = this.preferredWorkspacePath;
  }

  getWorkspacePath() {
    return this.currentWorkspacePath;
  }

  getWorkspaceId() {
    return this.currentWorkspaceId;
  }

  async load(options = {}) {
    const catalog = await this.ensureCatalog(options.preferredWorkspaceId);
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(catalog.currentWorkspaceId);
    const store = this.currentStore();
    try {
      const loaded = await store.load();
      return this.describeCurrent(loaded.workspace, {
        recovered: loaded.recovered === true,
        recoveredPath: loaded.recoveredPath || ''
      });
    } catch (error) {
      if (error instanceof WorkspaceRecoveryError) {
        error.path = this.currentWorkspacePath;
        error.activeWorkspaceId = this.currentWorkspaceId;
        error.workspaces = await this.listWorkspaceItems();
      }
      throw error;
    }
  }

  async describeCurrent(workspace, extras = {}) {
    return {
      workspace,
      path: this.currentWorkspacePath,
      activeWorkspaceId: this.currentWorkspaceId,
      workspaces: await this.listWorkspaceItems(),
      ...extras
    };
  }

  async listWorkspaceItems() {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    const deletable = catalog.files.length > 1;
    return Promise.all(catalog.files.map((file) => this.describeWorkspaceItem(file, {
      current: file === catalog.currentWorkspaceId,
      deletable
    })));
  }

  async save(workspace) {
    return this.currentStore().save(workspace);
  }

  async backupCurrentWorkspace(reason = 'manual.backup') {
    return this.currentStore().backupCurrentWorkspace(reason);
  }

  async importWorkspace(importPath) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    const importedWorkspace = await this.currentStore().importWorkspace(importPath);
    const workspaceName = await this.nextWorkspaceName(importWorkspaceDisplayName(importPath));
    const filename = this.nextWorkspaceFilename(catalog.files, workspaceName);
    await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(importedWorkspace);
    return filename;
  }

  async exportWorkspace(workspace, exportPath) {
    return this.currentStore().exportWorkspace(workspace, exportPath);
  }

  async exportWorkspaceById(workspaceId, exportPath) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const store = new WorkspaceStore(this.absoluteWorkspacePath(workspaceId));
    const loaded = await store.load();
    return store.exportWorkspace(loaded.workspace, exportPath);
  }

  async importCollection(importPath) {
    return this.currentStore().importCollection(importPath);
  }

  async exportCollection(collection, exportPath, options = {}) {
    return this.currentStore().exportCollection(collection, exportPath, options);
  }

  async createWorkspace(options = {}) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    const workspaceName = await this.nextWorkspaceName(options.name);
    const workspace = defaultWorkspace();
    const filename = this.nextWorkspaceFilename(catalog.files, workspaceName);
    await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(workspace);
    return filename;
  }

  async renameWorkspace(workspaceId, nextName) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const normalizedName = normalizeWorkspaceDisplayName(nextName);
    const renamedFilename = this.nextWorkspaceFilename(
      catalog.files.filter((file) => file !== workspaceId),
      normalizedName
    );
    const currentPath = this.absoluteWorkspacePath(workspaceId);
    const renamedPath = this.absoluteWorkspacePath(renamedFilename);
    if (workspaceId !== renamedFilename) {
      await renameWorkspaceFile(currentPath, renamedPath);
    }
    catalog.files = catalog.files
      .map((file) => (file === workspaceId ? renamedFilename : file))
      .sort((left, right) => left.localeCompare(right));
    if (catalog.currentWorkspaceId === workspaceId) {
      catalog.currentWorkspaceId = renamedFilename;
    }
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(this.currentWorkspaceId);
    return this.load();
  }

  async switchWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    return this.load({ preferredWorkspaceId: workspaceId });
  }

  async deleteWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    if (catalog.files.length <= 1) {
      throw new Error('At least one workspace must remain.');
    }
    await fs.rm(this.absoluteWorkspacePath(workspaceId), { force: true });
    const remainingFiles = catalog.files.filter((file) => file !== workspaceId);
    catalog.files = remainingFiles;
    if (catalog.currentWorkspaceId === workspaceId) {
      catalog.currentWorkspaceId = remainingFiles[0] || this.preferredWorkspaceFilename;
    }
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(this.currentWorkspaceId);
    return this.load();
  }

  currentStore() {
    return new WorkspaceStore(this.currentWorkspacePath);
  }

  absoluteWorkspacePath(filename) {
    return path.join(this.baseDirectory, filename);
  }

  async ensureCatalog(preferredWorkspaceId = '') {
    await this.removeLegacyManifestFile();
    const files = await this.discoverWorkspaceFiles();
    if (!files.length) {
      const workspace = defaultWorkspace();
      const filename = workspaceFilename('Local Workspace', this.workspaceExtension);
      await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(workspace);
      files.push(filename);
    }
    const desiredWorkspaceId = String(preferredWorkspaceId || this.currentWorkspaceId || '').trim();
    return {
      currentWorkspaceId: files.includes(desiredWorkspaceId) ? desiredWorkspaceId : files[0],
      files
    };
  }

  async removeLegacyManifestFile() {
    await fs.rm(this.legacyManifestPath, { force: true });
  }

  async discoverWorkspaceFiles() {
    let entries = [];
    try {
      entries = await fs.readdir(this.baseDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (await this.isManagedWorkspaceFilename(entry.name)) {
        files.push(entry.name);
      }
    }
    return files.sort((left, right) => left.localeCompare(right));
  }

  async isManagedWorkspaceFilename(filename) {
    if (typeof filename !== 'string' || !filename.trim().endsWith(this.workspaceExtension)) {
      return false;
    }
    if (filename === path.basename(this.legacyManifestPath)) {
      return false;
    }
    try {
      const parsed = JSON.parse(await fs.readFile(this.absoluteWorkspacePath(filename), 'utf8'));
      return looksLikeNativeWorkspace(parsed);
    } catch {
      return false;
    }
  }

  async nextWorkspaceName(baseName = 'Workspace') {
    const existingNames = new Set(
      (await this.listWorkspaceItems()).map((item) => String(item.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const normalizedBaseName = normalizeWorkspaceDisplayName(baseName);
    if (!existingNames.has(normalizedBaseName.toLowerCase())) {
      return normalizedBaseName;
    }
    for (let index = 2; index <= 10_000; index += 1) {
      const candidate = `${normalizedBaseName} ${index}`;
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${normalizedBaseName} ${Date.now()}`;
  }

  nextWorkspaceFilename(existingFiles, workspaceName) {
    const existing = new Set(existingFiles);
    const normalizedWorkspaceName = normalizeWorkspaceDisplayName(workspaceName);
    const baseFilename = workspaceFilename(normalizedWorkspaceName, this.workspaceExtension);
    if (!existing.has(baseFilename)) {
      return baseFilename;
    }
    for (let index = 2; index <= 10_000; index += 1) {
      const candidate = workspaceFilename(`${normalizedWorkspaceName} ${index}`, this.workspaceExtension);
      if (!existing.has(candidate)) {
        return candidate;
      }
    }
    return workspaceFilename(`${normalizedWorkspaceName} ${Date.now()}`, this.workspaceExtension);
  }

  workspaceDisplayNameFromFilename(filename) {
    const basename = path.basename(filename, this.workspaceExtension);
    return basename || 'Workspace';
  }

  async describeWorkspaceItem(file, options = {}) {
    const summary = await this.readWorkspaceSummary(file);
    return {
      id: file,
      name: this.workspaceDisplayNameFromFilename(file),
      path: this.absoluteWorkspacePath(file),
      current: options.current === true,
      deletable: options.deletable === true,
      schemaVersion: summary.schemaVersion,
      theme: summary.theme,
      collectionCount: summary.collectionCount,
      folderCount: summary.folderCount,
      requestCount: summary.requestCount,
      environmentCount: summary.environmentCount,
      cookieCount: summary.cookieCount,
      historyCount: summary.historyCount
    };
  }

  async readWorkspaceSummary(file) {
    try {
      const parsed = JSON.parse(await fs.readFile(this.absoluteWorkspacePath(file), 'utf8'));
      return workspaceSummary(normalizeWorkspace(parsed));
    } catch {
      return workspaceSummary(defaultWorkspace());
    }
  }
}

function workspaceFilename(name, extension) {
  const safeBase = safeWorkspaceFilenamePart(name);
  return `${safeBase}${extension}`;
}

async function renameWorkspaceFile(currentPath, nextPath) {
  if (currentPath === nextPath) {
    return;
  }
  if (currentPath.toLowerCase() !== nextPath.toLowerCase()) {
    await fs.rename(currentPath, nextPath);
    return;
  }
  const tempPath = path.join(path.dirname(currentPath), `postmeter-workspace-rename-${process.pid}-${Date.now()}.json.tmp`);
  await fs.rename(currentPath, tempPath);
  await fs.rename(tempPath, nextPath);
}

function normalizeWorkspaceDisplayName(name) {
  return safeWorkspaceFilenamePart(name || 'Workspace') || 'Workspace';
}

function safeWorkspaceFilenamePart(name) {
  const normalized = String(name || 'Workspace')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return normalized || 'Workspace';
}

function importWorkspaceDisplayName(importPath) {
  const parsed = path.parse(String(importPath || 'Workspace'));
  const nestedParsed = path.parse(parsed.name || '');
  const baseName = nestedParsed.ext.toLowerCase() === '.postmeter'
    ? nestedParsed.name
    : parsed.name;
  return normalizeWorkspaceDisplayName(baseName || 'Workspace');
}

function workspaceSummary(workspace) {
  let requestCount = 0;
  for (const collection of workspace.collections || []) {
    walkRequests(collection, () => {
      requestCount += 1;
    });
  }
  return {
    schemaVersion: Number(workspace?.schemaVersion) || 0,
    theme: typeof workspace?.settings?.appearance?.theme === 'string' && workspace.settings.appearance.theme.trim()
      ? workspace.settings.appearance.theme.trim()
      : 'system',
    collectionCount: Array.isArray(workspace?.collections) ? workspace.collections.length : 0,
    folderCount: countWorkspaceFolders(workspace),
    requestCount,
    environmentCount: Array.isArray(workspace?.environments) ? workspace.environments.length : 0,
    cookieCount: Array.isArray(workspace?.cookies) ? workspace.cookies.length : 0,
    historyCount: Array.isArray(workspace?.history) ? workspace.history.length : 0
  };
}

function countWorkspaceFolders(workspace) {
  let count = 0;
  const walkFolder = (folder) => {
    count += 1;
    for (const child of folder.folders || []) {
      walkFolder(child);
    }
  };
  for (const collection of workspace.collections || []) {
    for (const folder of collection.folders || []) {
      walkFolder(folder);
    }
  }
  return count;
}

module.exports = {
  WorkspaceManager
};
