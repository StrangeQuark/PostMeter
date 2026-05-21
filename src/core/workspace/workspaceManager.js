const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultWorkspace, walkRequests } = require('./models');
const {
  fsyncDirectory,
  moveFileNoOverwrite,
  pathExists,
  temporaryJsonPath,
  workspaceForExport,
  writeTextFileAtomic
} = require('./workspacePersistence');
const {
  WorkspaceRecoveryError,
  WorkspaceStore,
  defaultWorkspacePath,
  normalizeWorkspace
} = require('./workspaceStore');
const {
  WorkspaceEncryptionKeyRequiredError,
  assertWorkspaceEncryptionKey,
  decryptWorkspaceEnvelope,
  encryptWorkspacePayload,
  isEncryptedWorkspaceEnvelope
} = require('./workspaceEncryption');

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
    this.workspaceEncryptionKeys = new Map();
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
    this.pruneWorkspaceEncryptionKeys(this.currentWorkspaceId);
    const store = this.currentStore();
    try {
      const loaded = await store.load({ encryptionKey: this.encryptionKeyForWorkspace(this.currentWorkspaceId) });
      return this.describeCurrent(loaded.workspace, {
        encrypted: loaded.encrypted === true,
        locked: false,
        recovered: loaded.recovered === true,
        recoveredPath: loaded.recoveredPath || ''
      });
    } catch (error) {
      if (error instanceof WorkspaceEncryptionKeyRequiredError) {
        return this.describeCurrent(defaultWorkspace(), {
          encrypted: true,
          locked: true,
          recovered: false,
          recoveredPath: ''
        });
      }
      if (error instanceof WorkspaceRecoveryError) {
        error.path = this.currentWorkspacePath;
        error.activeWorkspaceId = this.currentWorkspaceId;
        error.workspaces = await this.listWorkspaceItems();
      }
      throw error;
    }
  }

  async describeCurrent(workspace, extras = {}) {
    const encrypted = extras.encrypted == null
      ? await this.isWorkspaceEncrypted(this.currentWorkspaceId)
      : extras.encrypted === true;
    const locked = extras.locked == null
      ? encrypted && !this.encryptionKeyForWorkspace(this.currentWorkspaceId)
      : extras.locked === true;
    return {
      workspace,
      path: this.currentWorkspacePath,
      activeWorkspaceId: this.currentWorkspaceId,
      workspaces: await this.listWorkspaceItems(),
      encrypted,
      locked,
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
    return this.currentStore().save(workspace, {
      encryptionKey: this.encryptionKeyForWorkspace(this.currentWorkspaceId)
    });
  }

  saveSync(workspace) {
    return this.currentStore().saveSync(workspace, {
      encryptionKey: this.encryptionKeyForWorkspace(this.currentWorkspaceId)
    });
  }

  async backupCurrentWorkspace(reason = 'manual.backup') {
    return this.currentStore().backupCurrentWorkspace(reason);
  }

  async importWorkspace(importPath) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    const rawContent = await fs.readFile(importPath, 'utf8');
    const parsed = JSON.parse(rawContent);
    if (isEncryptedWorkspaceEnvelope(parsed)) {
      const workspaceName = await this.nextWorkspaceName(importWorkspaceDisplayName(importPath));
      return this.saveNewWorkspaceTextFile(workspaceName, rawContent, catalog.files);
    }
    const importedWorkspace = await this.currentStore().importWorkspace(importPath);
    const workspaceName = await this.nextWorkspaceName(importWorkspaceDisplayName(importPath));
    return this.saveNewWorkspaceFile(workspaceName, importedWorkspace, catalog.files);
  }

  async exportWorkspace(workspace, exportPath) {
    if (await this.isWorkspaceEncrypted(this.currentWorkspaceId)) {
      return this.exportWorkspaceById(this.currentWorkspaceId, exportPath);
    }
    return this.currentStore().exportWorkspace(workspace, exportPath);
  }

  async exportWorkspaceById(workspaceId, exportPath, options = {}) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    if (await this.isWorkspaceEncrypted(workspaceId)) {
      const encryptionKey = options.encryptionKey || this.encryptionKeyForWorkspace(workspaceId);
      if (!encryptionKey) {
        throw new WorkspaceEncryptionKeyRequiredError('Workspace must be unlocked before exporting an encrypted workspace.');
      }
      const encryptedWorkspace = JSON.parse(await fs.readFile(this.absoluteWorkspacePath(workspaceId), 'utf8'));
      const workspace = await decryptWorkspaceEnvelope(encryptedWorkspace, encryptionKey);
      const exportEnvelope = await encryptWorkspacePayload(workspaceForExport(workspace), encryptionKey);
      await writeTextFileAtomic(exportPath, JSON.stringify(exportEnvelope, null, 2), { prefix: 'postmeter-workspace-export' });
      return exportPath;
    }
    const store = new WorkspaceStore(this.absoluteWorkspacePath(workspaceId));
    const loaded = await store.load({ encryptionKey: this.encryptionKeyForWorkspace(workspaceId) });
    return store.exportWorkspace(loaded.workspace, exportPath);
  }

  async duplicateWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const sourceName = this.workspaceDisplayNameFromFilename(workspaceId);
    const duplicateName = await this.nextWorkspaceName(`${sourceName} Copy`);
    if (await this.isWorkspaceEncrypted(workspaceId)) {
      const duplicatedWorkspaceId = await this.saveNewWorkspaceTextFile(
        duplicateName,
        await fs.readFile(this.absoluteWorkspacePath(workspaceId), 'utf8'),
        catalog.files
      );
      return duplicatedWorkspaceId;
    }
    const sourceWorkspace = await this.loadWorkspaceById(workspaceId);
    return this.saveNewWorkspaceFile(duplicateName, sourceWorkspace, catalog.files);
  }

  async loadWorkspaceById(workspaceId) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const loaded = await new WorkspaceStore(this.absoluteWorkspacePath(workspaceId)).load({
      encryptionKey: this.encryptionKeyForWorkspace(workspaceId)
    });
    return loaded.workspace;
  }

  async restoreWorkspaceFile(workspaceId, workspace, options = {}) {
    if (typeof workspaceId !== 'string' || !workspaceId.trim() || path.basename(workspaceId) !== workspaceId) {
      throw new Error('workspaceId must be a managed workspace filename.');
    }
    if (!workspaceId.endsWith(this.workspaceExtension)) {
      throw new Error(`workspaceId must end with ${this.workspaceExtension}.`);
    }
    const targetPath = this.absoluteWorkspacePath(workspaceId);
    if (await pathExists(targetPath)) {
      throw new Error(`Workspace "${workspaceId}" already exists.`);
    }
    await new WorkspaceStore(targetPath).save(workspace, { overwrite: false });
    const catalog = await this.ensureCatalog(workspaceId);
    const requestedCurrent = typeof options.currentWorkspaceId === 'string' ? options.currentWorkspaceId : '';
    const preferredWorkspaceId = catalog.files.includes(requestedCurrent)
      ? requestedCurrent
      : workspaceId;
    return this.load({ preferredWorkspaceId });
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
    return this.saveNewWorkspaceFile(workspaceName, workspace, catalog.files);
  }

  async renameWorkspace(workspaceId, nextName) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const normalizedName = normalizeWorkspaceDisplayName(nextName);
    const currentPath = this.absoluteWorkspacePath(workspaceId);
    const reservedFiles = new Set(catalog.files.filter((file) => file !== workspaceId));
    let renamedFilename = workspaceId;
    let renamed = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      renamedFilename = await this.nextAvailableWorkspaceFilename(
        Array.from(reservedFiles),
        normalizedName,
        { allowedFilename: workspaceId }
      );
      const renamedPath = this.absoluteWorkspacePath(renamedFilename);
      if (workspaceId === renamedFilename) {
        renamed = true;
        break;
      }
      try {
        await renameWorkspaceFile(currentPath, renamedPath);
        renamed = true;
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
        reservedFiles.add(renamedFilename);
      }
    }
    if (!renamed) {
      throw new Error('Could not allocate a non-conflicting workspace rename path.');
    }
    catalog.files = catalog.files
      .map((file) => (file === workspaceId ? renamedFilename : file))
      .sort((left, right) => left.localeCompare(right));
    if (catalog.currentWorkspaceId === workspaceId) {
      catalog.currentWorkspaceId = renamedFilename;
    }
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(this.currentWorkspaceId);
    return {
      ...(await this.load()),
      renamedWorkspaceId: renamedFilename
    };
  }

  async switchWorkspace(workspaceId) {
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    return this.load({ preferredWorkspaceId: workspaceId });
  }

  async unlockWorkspace(workspaceId, encryptionKey) {
    assertWorkspaceEncryptionKey(encryptionKey);
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    if (workspaceId !== this.currentWorkspaceId) {
      throw new Error('Only the active workspace can be unlocked. Switch to the workspace before unlocking it.');
    }
    const loaded = await new WorkspaceStore(this.absoluteWorkspacePath(workspaceId)).load({ encryptionKey });
    if (loaded.encrypted !== true) {
      throw new Error(`Workspace "${workspaceId}" is not encrypted.`);
    }
    this.workspaceEncryptionKeys.clear();
    this.workspaceEncryptionKeys.set(this.currentWorkspaceId, encryptionKey);
    return this.describeCurrent(loaded.workspace, {
      encrypted: loaded.encrypted === true,
      locked: false
    });
  }

  async encryptWorkspace(workspaceId, workspace, encryptionKey) {
    assertWorkspaceEncryptionKey(encryptionKey);
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    const targetStore = new WorkspaceStore(this.absoluteWorkspacePath(workspaceId));
    const sourceWorkspace = workspaceId === this.currentWorkspaceId
      ? normalizeWorkspace(workspace)
      : await targetStore.load().then((loaded) => loaded.workspace);
    const saved = await targetStore.encryptWorkspace(sourceWorkspace, encryptionKey);
    if (workspaceId === this.currentWorkspaceId) {
      this.workspaceEncryptionKeys.clear();
      this.workspaceEncryptionKeys.set(workspaceId, encryptionKey);
      return this.describeCurrent(saved, { encrypted: true, locked: false });
    }
    return this.describeCurrent(workspace, { encrypted: await this.isWorkspaceEncrypted(this.currentWorkspaceId), locked: false });
  }

  async removeWorkspaceEncryption(workspaceId, encryptionKey, currentWorkspace = defaultWorkspace()) {
    assertWorkspaceEncryptionKey(encryptionKey);
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    if (workspaceId !== this.currentWorkspaceId) {
      throw new Error('Only the active workspace can have encryption removed. Switch to the workspace before decrypting it.');
    }
    const targetStore = new WorkspaceStore(this.absoluteWorkspacePath(workspaceId));
    const saved = await targetStore.removeEncryption(encryptionKey);
    this.workspaceEncryptionKeys.delete(workspaceId);
    return this.describeCurrent(saved, { encrypted: false, locked: false });
  }

  async resetWorkspaceEncryptionKey(workspaceId, currentKey, newKey, currentWorkspace = null) {
    assertWorkspaceEncryptionKey(currentKey, 'Current workspace encryption key');
    assertWorkspaceEncryptionKey(newKey, 'New workspace encryption key');
    if (currentKey === newKey) {
      throw new Error('New workspace encryption key must be different from the current key.');
    }
    const catalog = await this.ensureCatalog(this.currentWorkspaceId);
    if (!catalog.files.includes(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" was not found.`);
    }
    if (workspaceId !== this.currentWorkspaceId) {
      throw new Error('Only the active workspace can have its encryption key reset. Switch to the workspace before resetting the key.');
    }
    if (!(await this.isWorkspaceEncrypted(workspaceId))) {
      throw new Error('Workspace is not encrypted.');
    }
    if (!this.encryptionKeyForWorkspace(workspaceId)) {
      throw new Error('Unlock workspace before resetting its encryption key.');
    }
    const targetStore = new WorkspaceStore(this.absoluteWorkspacePath(workspaceId));
    const sourceWorkspace = currentWorkspace ? normalizeWorkspace(currentWorkspace) : null;
    const saved = await targetStore.resetEncryptionKey(currentKey, newKey, sourceWorkspace);
    this.workspaceEncryptionKeys.clear();
    this.workspaceEncryptionKeys.set(workspaceId, newKey);
    return this.describeCurrent(saved, { encrypted: true, locked: false });
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
    this.workspaceEncryptionKeys.delete(workspaceId);
    await fsyncDirectory(this.baseDirectory);
    const remainingFiles = catalog.files.filter((file) => file !== workspaceId);
    catalog.files = remainingFiles;
    if (catalog.currentWorkspaceId === workspaceId) {
      catalog.currentWorkspaceId = remainingFiles[0] || this.preferredWorkspaceFilename;
    }
    this.currentWorkspaceId = catalog.currentWorkspaceId;
    this.currentWorkspacePath = this.absoluteWorkspacePath(this.currentWorkspaceId);
    return {
      ...(await this.load()),
      deletedWorkspaceId: workspaceId
    };
  }

  currentStore() {
    return new WorkspaceStore(this.currentWorkspacePath);
  }

  encryptionKeyForWorkspace(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '');
    if (!normalizedWorkspaceId || normalizedWorkspaceId !== this.currentWorkspaceId) {
      return '';
    }
    return this.workspaceEncryptionKeys.get(normalizedWorkspaceId) || '';
  }

  setWorkspaceEncryptionKey(workspaceId, encryptionKey) {
    assertWorkspaceEncryptionKey(encryptionKey);
    const normalizedWorkspaceId = String(workspaceId || this.currentWorkspaceId || '');
    if (!normalizedWorkspaceId || normalizedWorkspaceId !== this.currentWorkspaceId) {
      throw new Error('Only the active workspace can be unlocked.');
    }
    this.workspaceEncryptionKeys.clear();
    this.workspaceEncryptionKeys.set(normalizedWorkspaceId, encryptionKey);
  }

  clearWorkspaceEncryptionKey(workspaceId) {
    this.workspaceEncryptionKeys.delete(String(workspaceId || this.currentWorkspaceId || ''));
  }

  pruneWorkspaceEncryptionKeys(activeWorkspaceId = this.currentWorkspaceId) {
    const normalizedActiveWorkspaceId = String(activeWorkspaceId || '');
    for (const workspaceId of this.workspaceEncryptionKeys.keys()) {
      if (workspaceId !== normalizedActiveWorkspaceId) {
        this.workspaceEncryptionKeys.delete(workspaceId);
      }
    }
  }

  absoluteWorkspacePath(filename) {
    return path.join(this.baseDirectory, filename);
  }

  async ensureCatalog(preferredWorkspaceId = '') {
    await this.removeLegacyManifestFile();
    const desiredWorkspaceId = String(preferredWorkspaceId || this.currentWorkspaceId || '').trim();
    const files = await this.discoverWorkspaceFiles();
    if (desiredWorkspaceId && !files.includes(desiredWorkspaceId) && await this.isExistingWorkspaceFileCandidate(desiredWorkspaceId)) {
      files.push(desiredWorkspaceId);
      files.sort((left, right) => left.localeCompare(right));
    }
    if (!files.length) {
      const workspace = defaultWorkspace();
      const filename = await this.saveNewWorkspaceFile('Local Workspace', workspace, files);
      files.push(filename);
    }
    return {
      currentWorkspaceId: files.includes(desiredWorkspaceId) ? desiredWorkspaceId : files[0],
      files
    };
  }

  async removeLegacyManifestFile() {
    try {
      await fs.access(this.legacyManifestPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    await fs.rm(this.legacyManifestPath, { force: true });
    await fsyncDirectory(this.baseDirectory);
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
      return looksLikeManagedWorkspaceFile(parsed);
    } catch {
      return false;
    }
  }

  async isExistingWorkspaceFileCandidate(filename) {
    if (typeof filename !== 'string' || !filename.trim().endsWith(this.workspaceExtension)) {
      return false;
    }
    if (path.basename(filename) !== filename) {
      return false;
    }
    if (filename === path.basename(this.legacyManifestPath)) {
      return false;
    }
    try {
      const stats = await fs.stat(this.absoluteWorkspacePath(filename));
      return stats.isFile();
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

  async nextAvailableWorkspaceFilename(existingFiles, workspaceName, options = {}) {
    const existing = new Set(existingFiles);
    const normalizedWorkspaceName = normalizeWorkspaceDisplayName(workspaceName);
    const allowedFilename = typeof options.allowedFilename === 'string' ? options.allowedFilename : '';
    const candidateForIndex = (index) => {
      if (index === 1) {
        return workspaceFilename(normalizedWorkspaceName, this.workspaceExtension);
      }
      return workspaceFilename(`${normalizedWorkspaceName} ${index}`, this.workspaceExtension);
    };
    for (let index = 1; index <= 10_000; index += 1) {
      const candidate = candidateForIndex(index);
      if (!existing.has(candidate) && await this.workspaceFilenameAvailable(candidate, allowedFilename)) {
        return candidate;
      }
    }
    for (let index = 0; index < 100; index += 1) {
      const candidate = workspaceFilename(
        `${normalizedWorkspaceName} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
        this.workspaceExtension
      );
      if (!existing.has(candidate) && await this.workspaceFilenameAvailable(candidate, allowedFilename)) {
        return candidate;
      }
    }
    throw new Error('Could not allocate a non-conflicting workspace filename.');
  }

  async saveNewWorkspaceFile(workspaceName, workspace, existingFiles = []) {
    const reservedFiles = new Set(existingFiles);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const filename = await this.nextAvailableWorkspaceFilename(Array.from(reservedFiles), workspaceName);
      try {
        await new WorkspaceStore(this.absoluteWorkspacePath(filename)).save(workspace, { overwrite: false });
        return filename;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
        reservedFiles.add(filename);
      }
    }
    throw new Error('Could not allocate a non-conflicting workspace filename.');
  }

  async saveNewWorkspaceTextFile(workspaceName, content, existingFiles = []) {
    const reservedFiles = new Set(existingFiles);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const filename = await this.nextAvailableWorkspaceFilename(Array.from(reservedFiles), workspaceName);
      try {
        await writeTextFileAtomic(
          this.absoluteWorkspacePath(filename),
          String(content || ''),
          { prefix: 'postmeter-workspace-import', overwrite: false }
        );
        return filename;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
        reservedFiles.add(filename);
      }
    }
    throw new Error('Could not allocate a non-conflicting workspace filename.');
  }

  async isWorkspaceEncrypted(workspaceId) {
    try {
      const parsed = JSON.parse(await fs.readFile(this.absoluteWorkspacePath(workspaceId), 'utf8'));
      return isEncryptedWorkspaceEnvelope(parsed);
    } catch {
      return false;
    }
  }

  async workspaceFilenameAvailable(filename, allowedFilename = '') {
    const candidatePath = this.absoluteWorkspacePath(filename);
    if (!(await pathExists(candidatePath))) {
      return true;
    }
    if (!allowedFilename) {
      return false;
    }
    const allowedPath = this.absoluteWorkspacePath(allowedFilename);
    if (path.resolve(candidatePath) === path.resolve(allowedPath)) {
      return true;
    }
    try {
      const [candidateStats, allowedStats] = await Promise.all([
        fs.stat(candidatePath),
        fs.stat(allowedPath)
      ]);
      return candidateStats.dev === allowedStats.dev && candidateStats.ino === allowedStats.ino;
    } catch {
      return false;
    }
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
      collectionCount: summary.collectionCount,
      folderCount: summary.folderCount,
      requestCount: summary.requestCount,
      environmentCount: summary.environmentCount,
      runnerCount: summary.runnerCount,
      cookieCount: summary.cookieCount,
      historyCount: summary.historyCount,
      encrypted: summary.encrypted === true,
      locked: summary.locked === true
    };
  }

  async readWorkspaceSummary(file) {
    try {
      const parsed = JSON.parse(await fs.readFile(this.absoluteWorkspacePath(file), 'utf8'));
      if (isEncryptedWorkspaceEnvelope(parsed)) {
        const encryptionKey = this.encryptionKeyForWorkspace(file);
        if (!encryptionKey) {
          return workspaceSummary(defaultWorkspace(), { encrypted: true, locked: true });
        }
        try {
          return workspaceSummary(normalizeWorkspace(await decryptWorkspaceEnvelope(parsed, encryptionKey)), {
            encrypted: true,
            locked: false
          });
        } catch {
          this.clearWorkspaceEncryptionKey(file);
          return workspaceSummary(defaultWorkspace(), { encrypted: true, locked: true });
        }
      }
      return workspaceSummary(normalizeWorkspace(parsed));
    } catch {
      return workspaceSummary(defaultWorkspace());
    }
  }
}

function looksLikeManagedWorkspaceFile(value) {
  return isEncryptedWorkspaceEnvelope(value)
    || Boolean(
      value
      && typeof value === 'object'
      && (
        Object.hasOwn(value, 'schemaVersion')
        || Array.isArray(value.collections)
        || Array.isArray(value.environments)
        || Array.isArray(value.runners)
        || Array.isArray(value.performanceTests)
        || Array.isArray(value.history)
      )
    );
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
    await moveWorkspaceFileNoOverwrite(currentPath, nextPath);
    return;
  }
  const tempPath = temporaryJsonPath(currentPath, 'postmeter-workspace-rename');
  let movedToTemp = false;
  try {
    await moveWorkspaceFileNoOverwrite(currentPath, tempPath);
    movedToTemp = true;
    await moveWorkspaceFileNoOverwrite(tempPath, nextPath);
  } catch (error) {
    if (movedToTemp) {
      await moveWorkspaceFileNoOverwrite(tempPath, currentPath).catch(() => {});
    } else {
      await fs.rm(tempPath, { force: true }).catch(() => {});
    }
    throw error;
  }
}

async function moveWorkspaceFileNoOverwrite(currentPath, nextPath) {
  await moveFileNoOverwrite(currentPath, nextPath);
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

function workspaceSummary(workspace, extras = {}) {
  let requestCount = 0;
  for (const collection of workspace.collections || []) {
    walkRequests(collection, () => {
      requestCount += 1;
    });
  }
  return {
    schemaVersion: Number(workspace?.schemaVersion) || 0,
    collectionCount: Array.isArray(workspace?.collections) ? workspace.collections.length : 0,
    folderCount: countWorkspaceFolders(workspace),
    requestCount,
    environmentCount: Array.isArray(workspace?.environments) ? workspace.environments.length : 0,
    runnerCount: Array.isArray(workspace?.runners) ? workspace.runners.length : 0,
    cookieCount: Array.isArray(workspace?.cookies) ? workspace.cookies.length : 0,
    historyCount: Array.isArray(workspace?.history) ? workspace.history.length : 0,
    encrypted: extras.encrypted === true,
    locked: extras.locked === true
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
