const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace } = require('./models');
const { WorkspaceRecoveryError, WorkspaceStore, defaultWorkspacePath } = require('./workspaceStore');
const {
  pathExists,
  writeJsonFileAtomic
} = require('./workspacePersistence');

const WORKSPACE_MANIFEST_VERSION = 1;

class WorkspaceManager {
  constructor(preferredWorkspacePath = defaultWorkspacePath()) {
    this.preferredWorkspacePath = path.resolve(preferredWorkspacePath);
    this.baseDirectory = path.dirname(this.preferredWorkspacePath);
    this.workspaceExtension = path.extname(this.preferredWorkspacePath) || '.json';
    this.workspaceStem = path.basename(this.preferredWorkspacePath, this.workspaceExtension) || 'workspace';
    this.preferredWorkspaceFilename = path.basename(this.preferredWorkspacePath);
    this.manifestPath = path.join(this.baseDirectory, `${this.workspaceStem}.workspaces.manifest.json`);
    this.currentWorkspaceId = this.preferredWorkspaceFilename;
    this.currentWorkspacePath = this.preferredWorkspacePath;
  }

  getWorkspacePath() {
    return this.currentWorkspacePath;
  }

  getWorkspaceId() {
    return this.currentWorkspaceId;
  }

  async load() {
    const catalog = await this.ensureCatalog();
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
    const catalog = await this.ensureCatalog();
    const deletable = catalog.files.length > 1;
    return catalog.files.map((file) => ({
      id: file,
      name: this.workspaceDisplayNameFromFilename(file),
      path: this.absoluteWorkspacePath(file),
      current: file === catalog.currentWorkspaceId,
      deletable
    }));
  }

  async save(workspace) {
    return this.currentStore().save(workspace);
  }

  async backupCurrentWorkspace(reason = 'manual.backup') {
    return this.currentStore().backupCurrentWorkspace(reason);
  }

  async importWorkspace(importPath) {
    return this.currentStore().importWorkspace(importPath);
  }

  async exportWorkspace(workspace, exportPath) {
    return this.currentStore().exportWorkspace(workspace, exportPath);
  }

  async importCollection(importPath) {
    return this.currentStore().importCollection(importPath);
  }

  async exportCollection(collection, exportPath, options = {}) {
    return this.currentStore().exportCollection(collection, exportPath, options);
  }

  async createWorkspace(options = {}) {
    const catalog = await this.ensureCatalog();
    const workspaceName = await this.nextWorkspaceName(options.name);
    const workspace = defaultWorkspace();
    const filename = this.nextWorkspaceFilename(catalog.files, workspaceName);
    await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(workspace);
    catalog.files.push(filename);
    catalog.currentWorkspaceId = filename;
    await this.writeCatalog(catalog);
    this.currentWorkspaceId = filename;
    this.currentWorkspacePath = this.absoluteWorkspacePath(filename);
    return this.describeCurrent(workspace);
  }

  async renameWorkspace(workspaceId, nextName) {
    const catalog = await this.ensureCatalog();
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
    await this.writeCatalog(catalog);
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(this.currentWorkspaceId);
    return this.load();
  }

  async switchWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog();
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    catalog.currentWorkspaceId = workspaceId;
    await this.writeCatalog(catalog);
    return this.load();
  }

  async deleteWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog();
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
    await this.writeCatalog(catalog);
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

  async ensureCatalog() {
    const manifest = await this.readCatalog();
    const files = await this.discoverWorkspaceFiles(manifest);
    if (!files.length) {
      const workspace = defaultWorkspace();
      const filename = workspaceFilename('Local Workspace', this.workspaceExtension);
      await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(workspace);
      files.push(filename);
    }
    const currentWorkspaceId = files.includes(manifest?.currentWorkspaceId)
      ? manifest.currentWorkspaceId
      : files[0];
    const catalog = {
      version: WORKSPACE_MANIFEST_VERSION,
      currentWorkspaceId,
      files
    };
    if (!this.catalogMatches(manifest, catalog)) {
      await this.writeCatalog(catalog);
    }
    return catalog;
  }

  async readCatalog() {
    if (!(await pathExists(this.manifestPath))) {
      return null;
    }
    try {
      const parsed = JSON.parse(await fs.readFile(this.manifestPath, 'utf8'));
      const files = Array.isArray(parsed?.files)
        ? parsed.files.filter((file) => typeof file === 'string' && file.trim() && this.isManagedWorkspaceFilename(file))
        : [];
      return {
        version: parsed?.version || WORKSPACE_MANIFEST_VERSION,
        currentWorkspaceId: typeof parsed?.currentWorkspaceId === 'string' ? parsed.currentWorkspaceId : '',
        files
      };
    } catch {
      return null;
    }
  }

  async writeCatalog(catalog) {
    await writeJsonFileAtomic(this.manifestPath, {
      version: WORKSPACE_MANIFEST_VERSION,
      currentWorkspaceId: catalog.currentWorkspaceId,
      files: catalog.files
    });
  }

  async discoverWorkspaceFiles(manifest) {
    const files = [];
    for (const file of manifest?.files || []) {
      if (await pathExists(this.absoluteWorkspacePath(file)) && !files.includes(file)) {
        files.push(file);
      }
    }
    if (await pathExists(this.preferredWorkspacePath) && !files.includes(this.preferredWorkspaceFilename)) {
      files.push(this.preferredWorkspaceFilename);
    }
    return files.sort((left, right) => left.localeCompare(right));
  }

  isManagedWorkspaceFilename(filename) {
    return typeof filename === 'string'
      && filename.trim().endsWith(this.workspaceExtension)
      && filename !== path.basename(this.manifestPath);
  }

  catalogMatches(left, right) {
    if (!left) {
      return false;
    }
    if (left.currentWorkspaceId !== right.currentWorkspaceId) {
      return false;
    }
    if (!Array.isArray(left.files) || left.files.length !== right.files.length) {
      return false;
    }
    return left.files.every((file, index) => file === right.files[index]);
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

module.exports = {
  WorkspaceManager
};
