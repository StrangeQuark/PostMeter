const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  CURRENT_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  collectionModel,
  defaultWorkspace,
  folderModel,
  newId,
  requestModel,
  workspaceModel
} = require('./models');
const { importPostmanCollection } = require('./postmanImporter');
const {
  decryptWorkspaceSecrets,
  encryptWorkspaceSecrets,
  redactWorkspaceSecrets
} = require('./secrets');

function defaultWorkspacePath() {
  if (process.env.POSTMETER_DATA_PATH && process.env.POSTMETER_DATA_PATH.trim()) {
    return process.env.POSTMETER_DATA_PATH;
  }
  return path.join(os.homedir(), '.postmeter', 'workspace.json');
}

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
  constructor(workspacePath = defaultWorkspacePath(), options = {}) {
    this.workspacePath = workspacePath;
    this.secretCodec = options.secretCodec || null;
  }

  getWorkspacePath() {
    return this.workspacePath;
  }

  async load() {
    if (!(await exists(this.workspacePath))) {
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
    const workspace = normalizeWorkspace(decryptWorkspaceSecrets(parsed, this.secretCodec));
    if (migrated) {
      await this.createBackup('pre-migration.backup');
      await this.save(workspace);
    }
    return { workspace, recovered: false };
  }

  async save(workspace) {
    const normalized = normalizeWorkspace(workspace);
    const persisted = encryptWorkspaceSecrets(normalized, this.secretCodec);
    await fs.mkdir(path.dirname(this.workspacePath), { recursive: true });
    const tempPath = path.join(path.dirname(this.workspacePath), `postmeter-workspace-${process.pid}-${Date.now()}.json.tmp`);
    await fs.writeFile(tempPath, JSON.stringify(persisted, null, 2));
    await fs.rename(tempPath, this.workspacePath);
    return normalized;
  }

  async backupCurrentWorkspace(reason = 'manual.backup') {
    if (!(await exists(this.workspacePath))) {
      return null;
    }
    return this.createBackup(reason);
  }

  async importWorkspace(importPath) {
    const parsed = JSON.parse(await fs.readFile(importPath, 'utf8'));
    migrate(parsed);
    return normalizeWorkspace(decryptWorkspaceSecrets(parsed, this.secretCodec));
  }

  async exportWorkspace(workspace, exportPath, options = {}) {
    const normalized = normalizeWorkspace(workspace);
    const exportable = options.includeSecrets === true ? normalized : redactWorkspaceSecrets(normalized);
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, JSON.stringify(exportable, null, 2));
    return exportPath;
  }

  async importCollection(importPath) {
    const parsed = JSON.parse(await fs.readFile(importPath, 'utf8'));
    if (looksLikeNativeWorkspace(parsed)) {
      migrate(parsed);
      const workspace = normalizeWorkspace(decryptWorkspaceSecrets(parsed, this.secretCodec));
      if (!workspace.collections.length) {
        throw new Error('Imported file does not contain any collections.');
      }
      const collection = workspace.collections[0];
      regenerateCollectionIds(collection);
      return collection;
    }

    try {
      const collection = importPostmanCollection(parsed);
      regenerateCollectionIds(collection);
      return collection;
    } catch (postmanError) {
      const error = new Error('File is not a supported PostMeter or Postman collection.');
      error.cause = postmanError;
      throw error;
    }
  }

  async exportCollection(collection, exportPath, options = {}) {
    const workspace = normalizeWorkspace({ collections: [collection], environments: [], history: [] });
    const exportable = options.includeSecrets === true ? workspace : redactWorkspaceSecrets(workspace);
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, JSON.stringify(exportable, null, 2));
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

function migrate(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw new Error('Workspace data is required.');
  }
  const schemaVersion = workspace.schemaVersion || 1;
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Workspace schema version ${schemaVersion} is newer than this app supports (${CURRENT_SCHEMA_VERSION}).`);
  }
  if (schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`Workspace schema version ${schemaVersion} is not supported.`);
  }
  let migrated = false;
  if (schemaVersion < 2) {
    workspace.schemaVersion = 2;
    migrated = true;
  }
  if (schemaVersion < 3) {
    for (const collection of workspace.collections || []) {
      if (!Array.isArray(collection.folders)) {
        collection.folders = [];
      }
    }
    workspace.schemaVersion = 3;
    migrated = true;
  }
  if (schemaVersion < 4) {
    markPairSecrets(workspace, false);
    workspace.schemaVersion = 4;
    migrated = true;
  }
  return migrated;
}

function normalizeWorkspace(workspace) {
  const normalized = workspaceModel({
    ...workspace,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: Array.isArray(workspace?.collections)
      ? workspace.collections.map(collectionModel)
      : defaultWorkspace().collections,
    environments: Array.isArray(workspace?.environments) ? workspace.environments : [],
    history: Array.isArray(workspace?.history) ? workspace.history : []
  });
  return normalized;
}

function markPairSecrets(workspace, secret) {
  for (const collection of workspace.collections || []) {
    markCollectionPairSecrets(collection, secret);
  }
  for (const environment of workspace.environments || []) {
    for (const variable of environment.variables || []) {
      if (variable && typeof variable === 'object' && !Object.hasOwn(variable, 'secret')) {
        variable.secret = secret;
      }
    }
  }
}

function markCollectionPairSecrets(collection, secret) {
  for (const request of collection.requests || []) {
    markPairs(request.queryParams, secret);
    markPairs(request.headers, secret);
  }
  for (const folder of collection.folders || []) {
    markFolderPairSecrets(folder, secret);
  }
}

function markFolderPairSecrets(folder, secret) {
  for (const request of folder.requests || []) {
    markPairs(request.queryParams, secret);
    markPairs(request.headers, secret);
  }
  for (const child of folder.folders || []) {
    markFolderPairSecrets(child, secret);
  }
}

function markPairs(pairs, secret) {
  for (const pair of pairs || []) {
    if (pair && typeof pair === 'object' && !Object.hasOwn(pair, 'secret')) {
      pair.secret = secret;
    }
  }
}

function looksLikeNativeWorkspace(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (
      Object.hasOwn(value, 'schemaVersion')
      || Array.isArray(value.collections)
      || Array.isArray(value.environments)
      || Array.isArray(value.history)
    )
  );
}

function regenerateCollectionIds(collection) {
  collection.id = newId();
  for (const request of collection.requests || []) {
    request.id = newId();
  }
  for (const folder of collection.folders || []) {
    regenerateFolderIds(folder);
  }
}

function regenerateFolderIds(folder) {
  folder.id = newId();
  folder.requests = (folder.requests || []).map((request) => requestModel({ ...request, id: newId() }));
  folder.folders = (folder.folders || []).map((child) => {
    const normalized = folderModel(child);
    regenerateFolderIds(normalized);
    return normalized;
  });
}

function siblingPath(sourcePath, label) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.${label}.${timestamp}`);
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
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
