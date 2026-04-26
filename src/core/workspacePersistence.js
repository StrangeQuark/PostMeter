const syncFs = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const {
  CURRENT_SCHEMA_VERSION,
  collectionModel,
  defaultWorkspace,
  workspaceModel
} = require('./models');

function defaultWorkspacePath() {
  if (process.env.POSTMETER_DATA_PATH && process.env.POSTMETER_DATA_PATH.trim()) {
    return process.env.POSTMETER_DATA_PATH;
  }
  return path.join(os.homedir(), '.postmeter', 'workspace.json');
}

function parseStructuredCollectionContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    if (!looksLikeYamlOpenApi(content)) {
      return null;
    }
    try {
      return YAML.parse(content);
    } catch {
      return null;
    }
  }
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
    history: Array.isArray(workspace?.history) ? workspace.history : []
  });
  return normalized;
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

function siblingPath(sourcePath, label) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.${label}.${timestamp}`);
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
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(value, null, 2));
  return targetPath;
}

async function writeJsonFileAtomic(targetPath, value) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(path.dirname(targetPath), `postmeter-workspace-${process.pid}-${Date.now()}.json.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, targetPath);
  return targetPath;
}

function writeJsonFileAtomicSync(targetPath, value) {
  syncFs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(path.dirname(targetPath), `postmeter-workspace-${process.pid}-${Date.now()}.json.tmp`);
  syncFs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  syncFs.renameSync(tempPath, targetPath);
  return targetPath;
}

module.exports = {
  defaultWorkspacePath,
  looksLikeNativeWorkspace,
  normalizeWorkspace,
  parseStructuredCollectionContent,
  pathExists,
  siblingPath,
  writeJsonFile,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync
};
