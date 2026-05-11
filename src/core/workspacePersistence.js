const crypto = require('node:crypto');
const syncFs = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const {
  CURRENT_SCHEMA_VERSION,
  collectionModel,
  defaultWorkspace,
  performanceTestModel,
  runnerModel,
  workspaceModel
} = require('./models');

function defaultWorkspacePath() {
  if (process.env.POSTMETER_DATA_PATH && process.env.POSTMETER_DATA_PATH.trim()) {
    return process.env.POSTMETER_DATA_PATH;
  }
  return path.join(os.homedir(), '.postmeter', 'workspace.json');
}

function parseStructuredCollectionContent(content) {
  const text = String(content || '');
  try {
    return JSON.parse(text);
  } catch (jsonError) {
    if (looksLikeJsonDocument(text)) {
      const error = new Error(`Failed to parse JSON collection file: ${jsonError.message}`);
      error.cause = jsonError;
      throw error;
    }
    if (!looksLikeYamlOpenApi(text)) {
      return null;
    }
    try {
      return YAML.parse(text);
    } catch (yamlError) {
      const error = new Error(`Failed to parse OpenAPI YAML file: ${yamlError.message}`);
      error.cause = yamlError;
      throw error;
    }
  }
}

function looksLikeJsonDocument(content) {
  const text = String(content || '').trimStart();
  return text.startsWith('{') || text.startsWith('[');
}

function looksLikeYamlOpenApi(content) {
  return /^\s*(openapi|swagger)\s*:/m.test(content || '');
}

function normalizeWorkspace(workspace) {
  const normalized = workspaceModel({
    ...workspace,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: Array.isArray(workspace?.collections)
      ? workspace.collections.map(collectionModel)
      : defaultWorkspace().collections,
    environments: Array.isArray(workspace?.environments) ? workspace.environments : [],
    globals: Array.isArray(workspace?.globals) ? workspace.globals : [],
    cookies: Array.isArray(workspace?.cookies) ? workspace.cookies : [],
    runners: Array.isArray(workspace?.runners) ? workspace.runners.map(runnerModel) : [],
    performanceTests: Array.isArray(workspace?.performanceTests) ? workspace.performanceTests.map(performanceTestModel) : [],
    history: Array.isArray(workspace?.history) ? workspace.history : []
  });
  return normalized;
}

function workspaceForPersistence(workspace, options = {}) {
  const normalized = normalizeWorkspace(workspace);
  const { settings: _settings, ...persistedWorkspace } = normalized;
  if (options.includeLocalSettings === false) {
    delete persistedWorkspace.localsettings;
  }
  return persistedWorkspace;
}

function workspaceForExport(workspace) {
  return workspaceForPersistence(workspace, { includeLocalSettings: false });
}

function looksLikeNativeWorkspace(value) {
  return Boolean(
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

function siblingPath(sourcePath, label) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  return path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.${label}.${timestamp}.${suffix}`);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(targetPath, value) {
  return writeJsonFileAtomic(targetPath, value, { prefix: 'postmeter-json-export' });
}

async function writeJsonFileAtomic(targetPath, value, options = {}) {
  return writeTextFileAtomic(targetPath, JSON.stringify(value, null, 2), {
    ...options,
    prefix: options.prefix || 'postmeter-workspace'
  });
}

async function writeTextFileAtomic(targetPath, content, options = {}) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = temporaryJsonPath(targetPath, options.prefix || 'postmeter-file');
  let handle = null;
  try {
    handle = await fs.open(tempPath, 'wx', options.mode);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    if (options.overwrite === false) {
      await publishTempFileNoOverwrite(tempPath, targetPath);
    } else {
      await fs.rename(tempPath, targetPath);
    }
    await fsyncDirectory(path.dirname(targetPath));
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return targetPath;
}

function writeJsonFileAtomicSync(targetPath, value, options = {}) {
  return writeTextFileAtomicSync(targetPath, JSON.stringify(value, null, 2), {
    ...options,
    prefix: options.prefix || 'postmeter-workspace'
  });
}

function writeTextFileAtomicSync(targetPath, content, options = {}) {
  syncFs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = temporaryJsonPath(targetPath, options.prefix || 'postmeter-file');
  let fd = null;
  try {
    fd = syncFs.openSync(tempPath, 'wx', options.mode);
    syncFs.writeFileSync(fd, content);
    syncFs.fsyncSync(fd);
    syncFs.closeSync(fd);
    fd = null;
    if (options.overwrite === false) {
      publishTempFileNoOverwriteSync(tempPath, targetPath);
    } else {
      syncFs.renameSync(tempPath, targetPath);
    }
    fsyncDirectorySync(path.dirname(targetPath));
  } catch (error) {
    if (fd != null) {
      try {
        syncFs.closeSync(fd);
      } catch {}
    }
    try {
      syncFs.rmSync(tempPath, { force: true });
    } catch {}
    throw error;
  }
  return targetPath;
}

async function moveFileNoOverwrite(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await copyOrLinkFileNoOverwrite(sourcePath, targetPath);
  try {
    await fs.rm(sourcePath, { force: true });
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => {});
    throw error;
  }
  await fsyncDirectory(path.dirname(targetPath));
  return targetPath;
}

async function publishTempFileNoOverwrite(tempPath, targetPath) {
  await copyOrLinkFileNoOverwrite(tempPath, targetPath);
  await fs.rm(tempPath, { force: true }).catch(() => {});
}

function publishTempFileNoOverwriteSync(tempPath, targetPath) {
  copyOrLinkFileNoOverwriteSync(tempPath, targetPath);
  try {
    syncFs.rmSync(tempPath, { force: true });
  } catch {}
}

async function copyOrLinkFileNoOverwrite(sourcePath, targetPath) {
  try {
    await fs.link(sourcePath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOENT') {
      throw error;
    }
    try {
      await fs.copyFile(sourcePath, targetPath, syncFs.constants.COPYFILE_EXCL);
      await fsyncFile(targetPath);
    } catch (copyError) {
      await fs.rm(targetPath, { force: true }).catch(() => {});
      throw copyError;
    }
  }
}

function copyOrLinkFileNoOverwriteSync(sourcePath, targetPath) {
  try {
    syncFs.linkSync(sourcePath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOENT') {
      throw error;
    }
    try {
      syncFs.copyFileSync(sourcePath, targetPath, syncFs.constants.COPYFILE_EXCL);
      fsyncFileSync(targetPath);
    } catch (copyError) {
      try {
        syncFs.rmSync(targetPath, { force: true });
      } catch {}
      throw copyError;
    }
  }
}

async function fsyncFile(filePath) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    try {
      await handle.sync();
    } catch (error) {
      if (!isUnsupportedFsyncError(error)) {
        throw error;
      }
    }
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

function fsyncFileSync(filePath) {
  const fd = syncFs.openSync(filePath, 'r');
  try {
    try {
      syncFs.fsyncSync(fd);
    } catch (error) {
      if (!isUnsupportedFsyncError(error)) {
        throw error;
      }
    }
  } finally {
    syncFs.closeSync(fd);
  }
}

function isUnsupportedFsyncError(error) {
  return ['EINVAL', 'ENOTSUP', 'EPERM'].includes(error?.code);
}

function temporaryJsonPath(targetPath, prefix) {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  return path.join(path.dirname(targetPath), `${prefix}-${process.pid}-${Date.now()}-${suffix}.json.tmp`);
}

async function fsyncDirectory(directoryPath) {
  let handle = null;
  try {
    handle = await fs.open(directoryPath, 'r');
    await handle.sync();
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

function fsyncDirectorySync(directoryPath) {
  let fd = null;
  try {
    fd = syncFs.openSync(directoryPath, 'r');
    syncFs.fsyncSync(fd);
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (fd != null) {
      try {
        syncFs.closeSync(fd);
      } catch {}
    }
  }
}

module.exports = {
  defaultWorkspacePath,
  fsyncDirectory,
  fsyncDirectorySync,
  looksLikeNativeWorkspace,
  moveFileNoOverwrite,
  normalizeWorkspace,
  parseStructuredCollectionContent,
  pathExists,
  siblingPath,
  temporaryJsonPath,
  workspaceForPersistence,
  workspaceForExport,
  writeJsonFile,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync,
  writeTextFileAtomic,
  writeTextFileAtomicSync
};
