const syncFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace } = require('./models');
const { exportCollectionByFormat, importCollectionFromContent } = require('../import-export/collectionImportRegistry');
const { migrate } = require('./workspaceMigrations');
const {
  WorkspaceEncryptionKeyRequiredError,
  decryptWorkspaceEnvelope,
  encryptWorkspacePayload,
  encryptWorkspacePayloadSync,
  isEncryptedWorkspaceEnvelope
} = require('./workspaceEncryption');
const {
  defaultWorkspacePath,
  fsyncDirectory,
  looksLikeNativeWorkspace,
  moveFileNoOverwrite,
  normalizeWorkspace,
  pathExists,
  siblingPath,
  workspaceForExport,
  workspaceForPersistence,
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

  async load(options = {}) {
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
    let encrypted = false;
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

    if (isEncryptedWorkspaceEnvelope(parsed)) {
      encrypted = true;
      if (!options.encryptionKey) {
        throw new WorkspaceEncryptionKeyRequiredError('Workspace is encrypted. Enter the workspace key to unlock it.');
      }
      parsed = await decryptWorkspaceEnvelope(parsed, options.encryptionKey);
    }

    const migrated = migrate(parsed);
    const workspace = normalizeWorkspace(parsed);
    if (migrated) {
      await this.createBackup('pre-migration.backup');
      await this.save(workspace, encrypted ? { encryptionKey: options.encryptionKey } : {});
    }
    return { workspace, recovered: false, encrypted };
  }

  async save(workspace, options = {}) {
    const normalized = normalizeWorkspace(workspace);
    const persisted = workspaceForPersistence(normalized);
    if (options.encrypt === true || (!options.forcePlaintext && await this.isEncrypted())) {
      if (!options.encryptionKey) {
        throw new WorkspaceEncryptionKeyRequiredError('Workspace is encrypted. Enter the workspace key to save it.');
      }
      const envelope = await encryptWorkspacePayload(persisted, options.encryptionKey);
      await writeJsonFileAtomic(this.workspacePath, envelope, options);
      return normalized;
    }
    await writeJsonFileAtomic(this.workspacePath, persisted, options);
    return normalized;
  }

  saveSync(workspace, options = {}) {
    const normalized = normalizeWorkspace(workspace);
    const persisted = workspaceForPersistence(normalized);
    if (options.encrypt === true || (!options.forcePlaintext && this.isEncryptedSync())) {
      if (!options.encryptionKey) {
        throw new WorkspaceEncryptionKeyRequiredError('Workspace is encrypted. Enter the workspace key to save it.');
      }
      const envelope = encryptWorkspacePayloadSync(persisted, options.encryptionKey);
      writeJsonFileAtomicSync(this.workspacePath, envelope, options);
      return normalized;
    }
    writeJsonFileAtomicSync(this.workspacePath, persisted, options);
    return normalized;
  }

  async encryptWorkspace(workspace, encryptionKey) {
    const saved = await this.save(workspace, { encrypt: true, encryptionKey });
    await this.deleteBackupSiblingsByEncryptionState(false);
    return saved;
  }

  async removeEncryption(encryptionKey) {
    const loaded = await this.load({ encryptionKey });
    const saved = await this.save(loaded.workspace, { forcePlaintext: true });
    await this.deleteBackupSiblingsByEncryptionState(true);
    return saved;
  }

  async isEncrypted() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.workspacePath, 'utf8'));
      return isEncryptedWorkspaceEnvelope(parsed);
    } catch {
      return false;
    }
  }

  isEncryptedSync() {
    try {
      const parsed = JSON.parse(syncFs.readFileSync(this.workspacePath, 'utf8'));
      return isEncryptedWorkspaceEnvelope(parsed);
    } catch {
      return false;
    }
  }

  async readEncryptedWorkspace(encryptionKey) {
    const parsed = JSON.parse(await fs.readFile(this.workspacePath, 'utf8'));
    if (!isEncryptedWorkspaceEnvelope(parsed)) {
      return normalizeWorkspace(parsed);
    }
    return normalizeWorkspace(await decryptWorkspaceEnvelope(parsed, encryptionKey));
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
    return normalizeWorkspace({ ...parsed, settings: undefined, localsettings: undefined, localSettings: undefined });
  }

  async exportWorkspace(workspace, exportPath) {
    const normalized = normalizeWorkspace(workspace);
    await writeJsonFile(exportPath, workspaceForExport(normalized));
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

  async deleteBackupSiblingsByEncryptionState(encrypted) {
    const directory = path.dirname(this.workspacePath);
    const basename = path.basename(this.workspacePath);
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const deleted = [];
    for (const entry of entries) {
      if (!entry.isFile() || !looksLikeWorkspaceBackupFilename(entry.name, basename)) {
        continue;
      }
      const backupPath = path.join(directory, entry.name);
      let parsed = null;
      try {
        parsed = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      } catch {
        continue;
      }
      if (isEncryptedWorkspaceEnvelope(parsed) === encrypted) {
        await fs.rm(backupPath, { force: true });
        deleted.push(backupPath);
      }
    }
    if (deleted.length) {
      await fsyncDirectory(directory);
    }
    return deleted;
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

function looksLikeWorkspaceBackupFilename(filename, workspaceBasename) {
  return typeof filename === 'string'
    && filename.startsWith(`${workspaceBasename}.`)
    && filename.includes('.backup.');
}

module.exports = {
  WorkspaceRecoveryError,
  WorkspaceStore,
  defaultWorkspacePath,
  decryptWorkspaceEnvelope,
  isEncryptedWorkspaceEnvelope,
  looksLikeNativeWorkspace,
  migrate,
  normalizeWorkspace
};
