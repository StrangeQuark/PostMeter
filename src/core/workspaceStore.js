const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace } = require('./models');
const { exportCollectionByFormat, importCollectionFromContent } = require('./collectionImportRegistry');
const { migrate } = require('./workspaceMigrations');
const {
  defaultWorkspacePath,
  looksLikeNativeWorkspace,
  normalizeWorkspace,
  pathExists,
  siblingPath,
  writeJsonFile,
  writeJsonFileAtomic
} = require('./workspacePersistence');

class WorkspaceRecoveryError extends Error {
  constructor(message, recoveredWorkspace, recoveredPath, cause) {
    super(message);
    this.name = 'WorkspaceRecoveryError';
    this.recoveredWorkspace = recoveredWorkspace;
    this.recoveredPath = recoveredPath;
    this.cause = cause;
  }
}

class WorkspaceStore {
  constructor(workspacePath = defaultWorkspacePath()) {
    this.workspacePath = workspacePath;
  }

  getWorkspacePath() {
    return this.workspacePath;
  }

  async load() {
    if (!(await pathExists(this.workspacePath))) {
      const workspace = defaultWorkspace();
      await this.save(workspace);
      return { workspace, recovered: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.workspacePath, 'utf8'));
    } catch (error) {
      const recoveredPath = await this.quarantineCorruptWorkspace();
      const recoveredWorkspace = defaultWorkspace();
      await this.save(recoveredWorkspace);
      throw new WorkspaceRecoveryError(
        `Workspace file could not be read. A fresh workspace was created and the unreadable file was moved to ${recoveredPath}.`,
        recoveredWorkspace,
        recoveredPath,
        error
      );
    }

    const migrated = migrate(parsed);
    const workspace = normalizeWorkspace(parsed);
    if (migrated) {
      await this.createBackup('pre-migration.backup');
      await this.save(workspace);
    }
    return { workspace, recovered: false };
  }

  async save(workspace) {
    const normalized = normalizeWorkspace(workspace);
    await writeJsonFileAtomic(this.workspacePath, normalized);
    return normalized;
  }

  async backupCurrentWorkspace(reason = 'manual.backup') {
    if (!(await pathExists(this.workspacePath))) {
      return null;
    }
    return this.createBackup(reason);
  }

  async importWorkspace(importPath) {
    const parsed = JSON.parse(await fs.readFile(importPath, 'utf8'));
    migrate(parsed);
    return normalizeWorkspace(parsed);
  }

  async exportWorkspace(workspace, exportPath) {
    const normalized = normalizeWorkspace(workspace);
    await writeJsonFile(exportPath, normalized);
    return exportPath;
  }

  async importCollection(importPath) {
    const content = await fs.readFile(importPath, 'utf8');
    return importCollectionFromContent(content);
  }

  async exportCollection(collection, exportPath, options = {}) {
    const workspace = normalizeWorkspace({ collections: [collection], environments: [], history: [] });
    const normalizedCollection = workspace.collections[0];
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, exportCollectionByFormat(normalizedCollection, options.format || 'postmeter', workspace));
    return exportPath;
  }

  async createBackup(reason) {
    const backupPath = siblingPath(this.workspacePath, reason);
    await fs.copyFile(this.workspacePath, backupPath);
    return backupPath;
  }

  async quarantineCorruptWorkspace() {
    const recoveredPath = siblingPath(this.workspacePath, 'corrupt');
    await fs.rename(this.workspacePath, recoveredPath);
    return recoveredPath;
  }
}

module.exports = {
  WorkspaceRecoveryError,
  WorkspaceStore,
  defaultWorkspacePath,
  looksLikeNativeWorkspace,
  migrate,
  normalizeWorkspace
};
