const {
  CURRENT_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  normalizeWorkspaceLocalSettings
} = require('./models');

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
    workspace.schemaVersion = 4;
    migrated = true;
  }
  if (schemaVersion < 5) {
    for (const collection of workspace.collections || []) {
      if (!Array.isArray(collection.variables)) {
        collection.variables = [];
      }
    }
    workspace.schemaVersion = 5;
    migrated = true;
  }
  if (schemaVersion < 6) {
    for (const collection of workspace.collections || []) {
      ensureRequestScripts(collection.requests);
      ensureFolderRequestScripts(collection.folders);
    }
    workspace.schemaVersion = 6;
    migrated = true;
  }
  if (schemaVersion < 7) {
    workspace.settings ||= { updates: { includePrereleases: false } };
    workspace.settings.updates ||= { includePrereleases: false };
    for (const collection of workspace.collections || []) {
      ensureCollectionCompatibilityFields(collection);
    }
    workspace.schemaVersion = 7;
    migrated = true;
  }
  if (schemaVersion < 8) {
    if (!Array.isArray(workspace.cookies)) {
      workspace.cookies = [];
    }
    for (const collection of workspace.collections || []) {
      ensureCollectionCookieJarFields(collection);
    }
    workspace.schemaVersion = 8;
    migrated = true;
  }
  if (schemaVersion < 9) {
    workspace.settings ||= { updates: { includePrereleases: false } };
    workspace.schemaVersion = 9;
    migrated = true;
  }
  if (schemaVersion < 10) {
    workspace.settings ||= { updates: { includePrereleases: false } };
    delete workspace.settings.loadTestPolicy;
    workspace.schemaVersion = 10;
    migrated = true;
  }
  if (schemaVersion < 11) {
    if (!Array.isArray(workspace.globals)) {
      workspace.globals = [];
    }
    workspace.schemaVersion = 11;
    migrated = true;
  }
  if (schemaVersion < 12) {
    if (!Array.isArray(workspace.runners)) {
      workspace.runners = [];
    }
    workspace.schemaVersion = 12;
    migrated = true;
  }
  if (schemaVersion < 13) {
    if (!Array.isArray(workspace.performanceTests)) {
      workspace.performanceTests = [];
    }
    workspace.schemaVersion = 13;
    migrated = true;
  }
  if (schemaVersion < 14) {
    workspace.schemaVersion = 14;
    migrated = true;
  }
  if (schemaVersion < 15) {
    workspace.localsettings = normalizeWorkspaceLocalSettings(workspace.localsettings || workspace.settings || {});
    delete workspace.settings;
    workspace.schemaVersion = 15;
    migrated = true;
  }
  removeWorkspaceLoadTestPolicyFields(workspace);
  return migrated;
}

function ensureCollectionCompatibilityFields(collection) {
  if (!Array.isArray(collection.certificates)) {
    collection.certificates = [];
  }
  ensureRequestCompatibilityFields(collection.requests);
  for (const folder of collection.folders || []) {
    ensureFolderCompatibilityFields(folder);
  }
}

function ensureFolderCompatibilityFields(folder) {
  ensureRequestCompatibilityFields(folder.requests);
  for (const child of folder.folders || []) {
    ensureFolderCompatibilityFields(child);
  }
}

function ensureRequestCompatibilityFields(requests = []) {
  for (const request of requests || []) {
    if (!Array.isArray(request.variables)) {
      request.variables = [];
    }
    if (!Array.isArray(request.examples)) {
      request.examples = [];
    }
  }
}

function ensureCollectionCookieJarFields(collection) {
  ensureRequestCookieJarFields(collection.requests);
  for (const folder of collection.folders || []) {
    ensureFolderCookieJarFields(folder);
  }
}

function ensureFolderCookieJarFields(folder) {
  ensureRequestCookieJarFields(folder.requests);
  for (const child of folder.folders || []) {
    ensureFolderCookieJarFields(child);
  }
}

function ensureRequestCookieJarFields(requests = []) {
  for (const request of requests || []) {
    request.cookieJar ||= { enabled: false, storeResponses: true };
  }
}

function ensureFolderRequestScripts(folders = []) {
  for (const folder of folders || []) {
    ensureRequestScripts(folder.requests);
    ensureFolderRequestScripts(folder.folders);
  }
}

function removeWorkspaceLoadTestPolicyFields(workspace) {
  if (workspace?.settings) {
    delete workspace.settings.loadTestPolicy;
  }
  for (const collection of workspace?.collections || []) {
    removeCollectionLoadTestPolicyFields(collection);
  }
  for (const runner of workspace?.runners || []) {
    removeRequestLoadTestPolicyFields(runner.requests);
  }
}

function removeCollectionLoadTestPolicyFields(collection) {
  removeRequestLoadTestPolicyFields(collection.requests);
  for (const folder of collection.folders || []) {
    removeFolderLoadTestPolicyFields(folder);
  }
}

function removeFolderLoadTestPolicyFields(folder) {
  removeRequestLoadTestPolicyFields(folder.requests);
  for (const child of folder.folders || []) {
    removeFolderLoadTestPolicyFields(child);
  }
}

function removeRequestLoadTestPolicyFields(requests = []) {
  for (const request of requests || []) {
    delete request.loadTestPolicy;
  }
}

function ensureRequestScripts(requests = []) {
  for (const request of requests || []) {
    if (!request.scripts || typeof request.scripts !== 'object') {
      request.scripts = { preRequest: '', tests: '' };
    } else {
      request.scripts.preRequest = typeof request.scripts.preRequest === 'string' ? request.scripts.preRequest : '';
      request.scripts.tests = typeof request.scripts.tests === 'string' ? request.scripts.tests : '';
    }
  }
}

module.exports = {
  migrate
};
