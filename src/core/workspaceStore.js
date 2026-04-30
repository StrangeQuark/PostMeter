const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace } = require('./models');
const { exportCollectionByFormat, importCollectionFromContent } = require('./collectionImportRegistry');
const { migrate } = require('./workspaceMigrations');
const {
  defaultWorkspacePath,
  fsyncDirectory,
  looksLikeNativeWorkspace,
  moveFileNoOverwrite,
  normalizeWorkspace,
  pathExists,
  siblingPath,
  writeJsonFile,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync,
  writeTextFileAtomic
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
      try {
        await this.save(workspace, { overwrite: false });
      } catch (error) {
        if (error?.code === 'EEXIST') {
          return this.load();
        }
        throw error;
      }
      return { workspace, recovered: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.workspacePath, 'utf8'));
    } catch (error) {
      const recoveredPath = await this.quarantineCorruptWorkspace();
      let recoveredWorkspace = defaultWorkspace();
      let preservedReplacement = false;
      try {
        await this.save(recoveredWorkspace, { overwrite: false });
      } catch (saveError) {
        if (saveError?.code !== 'EEXIST') {
          throw saveError;
        }
        const replacement = await this.load();
        recoveredWorkspace = replacement.workspace;
        preservedReplacement = true;
      }
      throw new WorkspaceRecoveryError(
        preservedReplacement
          ? `Workspace file could not be read. The unreadable file was moved to ${recoveredPath}, and an existing replacement workspace was preserved.`
          : `Workspace file could not be read. A fresh workspace was created and the unreadable file was moved to ${recoveredPath}.`,
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

  async save(workspace, options = {}) {
    const normalized = normalizeWorkspace(workspace);
    await writeJsonFileAtomic(this.workspacePath, normalized, options);
    return normalized;
  }

  saveSync(workspace, options = {}) {
    const normalized = normalizeWorkspace(workspace);
    writeJsonFileAtomicSync(this.workspacePath, normalized, options);
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
    if (!looksLikeNativeWorkspace(parsed)) {
      throw new Error('Selected file is not a native PostMeter workspace.');
    }
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
    await writeTextFileAtomic(
      exportPath,
      exportCollectionByFormat(normalizedCollection, options.format || 'postmeter', workspace),
      { prefix: 'postmeter-collection-export' }
    );
    return exportPath;
  }

  async createBackup(reason) {
    const content = await fs.readFile(this.workspacePath, 'utf8');
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const backupPath = siblingPath(this.workspacePath, reason);
      try {
        await writeTextFileAtomic(
          backupPath,
          content,
          { prefix: 'postmeter-workspace-backup', overwrite: false }
        );
        return backupPath;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
      }
    }
    throw new Error('Could not allocate a non-conflicting workspace backup path.');
  }

  async quarantineCorruptWorkspace() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const recoveredPath = siblingPath(this.workspacePath, 'corrupt');
      try {
        await moveFileNoOverwrite(this.workspacePath, recoveredPath);
        await fsyncDirectory(path.dirname(recoveredPath));
        return recoveredPath;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
      }
    }
    throw new Error('Could not allocate a non-conflicting corrupt workspace recovery path.');
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
