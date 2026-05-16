const {
  normalizeSettings,
  walkRequests
} = require('../src/core/models');
const {
  normalizeCookieDomain,
  normalizeCookiePath
} = require('../src/core/cookieModel');

function cloneJson(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function updateWorkspaceRequestAuth(workspace, requestId, auth) {
  for (const collection of workspace.collections || []) {
    walkRequests(collection, (request) => {
      if (request.id === requestId) {
        request.auth = auth;
      }
    });
  }
}

function findWorkspaceRequestContext(workspace, requestId) {
  for (const collection of workspace.collections || []) {
    const found = findRequestInCollection(collection, requestId);
    if (found?.request) {
      return { collection, request: found.request, folder: found.folder || null, folders: found.folders || [] };
    }
  }
  return null;
}

function findWorkspaceRunnerRequestContext(workspace, runnerId, requestId) {
  const runner = (workspace?.runners || []).find((candidate) => candidate.id === runnerId);
  if (!runner) {
    return null;
  }
  const request = (runner.requests || []).find((candidate) => candidate.id === requestId);
  return request ? { runner, request } : null;
}

function findWorkspaceAuthRefreshRequestContext(workspace, ownerType, ownerId, requestId) {
  const owner = ownerType === 'runner'
    ? (workspace?.runners || []).find((candidate) => candidate.id === ownerId)
    : ownerType === 'performance'
      ? (workspace?.performanceTests || []).find((candidate) => candidate.id === ownerId)
      : null;
  const property = authRefreshRequestPropertyForId(owner?.authRefresh, requestId);
  return property ? { owner, request: owner.authRefresh[property], requestProperty: property } : null;
}

function authRefreshRequestPropertyForId(authRefresh, requestId) {
  if (!authRefresh || !requestId) {
    return '';
  }
  if (authRefresh.request?.id === requestId) {
    return 'request';
  }
  if (authRefresh.refreshTokenRequest?.id === requestId) {
    return 'refreshTokenRequest';
  }
  return '';
}

function authRefreshRequestPropertyForSave(authRefresh, payload) {
  return authRefreshRequestPropertyForId(authRefresh, payload?.requestId)
    || authRefreshRequestPropertyForId(payload?.authRefresh, payload?.requestId)
    || authRefreshRequestPropertyForId(payload?.runnerShell?.authRefresh, payload?.requestId)
    || authRefreshRequestPropertyForId(payload?.performanceShell?.authRefresh, payload?.requestId);
}

function findRequestInCollection(collection, requestId) {
  let match = null;
  walkRequests(collection, (request, _collection, folder, folders = []) => {
    if (!match && request.id === requestId) {
      match = { request, folder, folders };
    }
  });
  return match;
}

function applyScriptVariableMutationsToWorkspace(workspace, {
  collection,
  request,
  environment,
  collectionVariables,
  localVariables,
  globals,
  baseEnvironment,
  baseCollectionVariables,
  baseLocalVariables,
  baseGlobals
}) {
  applyEnvironmentVariablesToWorkspace(workspace, environment, baseEnvironment);
  if (collection && Array.isArray(collectionVariables)) {
    collection.variables = baseCollectionVariables
      ? mergeVariableScopeByDelta(collection.variables, baseCollectionVariables, collectionVariables)
      : clonePairs(collectionVariables);
  }
  if (request && Array.isArray(localVariables)) {
    request.variables = baseLocalVariables
      ? mergeVariableScopeByDelta(request.variables, baseLocalVariables, localVariables)
      : clonePairs(localVariables);
  }
  if (Array.isArray(globals)) {
    workspace.globals = baseGlobals
      ? mergeVariableScopeByDelta(workspace.globals, baseGlobals, globals)
      : clonePairs(globals);
  }
}

function applyCollectionRunMutationsToWorkspace(workspace, result, options = {}) {
  applyEnvironmentVariablesToWorkspace(workspace, result.environment, options.baseEnvironment);
  if (Array.isArray(result.globals)) {
    workspace.globals = options.baseGlobals
      ? mergeVariableScopeByDelta(workspace.globals, options.baseGlobals, result.globals)
      : clonePairs(result.globals);
  }
  const collection = (workspace.collections || []).find((candidate) => candidate.id === result.collectionId);
  if (!collection) {
    return;
  }
  if (Array.isArray(result.collectionVariables)) {
    collection.variables = options.baseCollectionVariables
      ? mergeVariableScopeByDelta(collection.variables, options.baseCollectionVariables, result.collectionVariables)
      : clonePairs(result.collectionVariables);
  }
  for (const item of result.results || []) {
    const found = item.requestId ? findRequestInCollection(collection, item.requestId) : null;
    const request = found?.request || null;
    if (request && item.updatedAuth) {
      request.auth = cloneJson(item.updatedAuth);
    }
    if (request && Array.isArray(item.localVariables)) {
      const baseLocalVariables = options.baseLocalVariablesByRequestId?.get?.(item.requestId);
      request.variables = baseLocalVariables
        ? mergeVariableScopeByDelta(request.variables, baseLocalVariables, item.localVariables)
        : clonePairs(item.localVariables);
    }
  }
  if (result.authUpdates instanceof Map) {
    for (const [requestId, auth] of result.authUpdates.entries()) {
      const found = findRequestInCollection(collection, requestId);
      if (found?.request) {
        found.request.auth = cloneJson(auth);
      }
    }
  }
}

function applyEnvironmentVariablesToWorkspace(workspace, environment, baseEnvironment) {
  if (!environment?.id || environment.id === 'runtime' || !Array.isArray(environment.variables)) {
    return;
  }
  const workspaceEnvironment = (workspace.environments || []).find((candidate) => candidate.id === environment.id);
  if (workspaceEnvironment) {
    workspaceEnvironment.variables = baseEnvironment?.id === environment.id
      ? mergeVariableScopeByDelta(workspaceEnvironment.variables, baseEnvironment.variables, environment.variables)
      : clonePairs(environment.variables);
  }
}

function clonePairs(pairs) {
  return Array.isArray(pairs) ? pairs.map((pair) => ({ ...pair })) : [];
}

function mergeVariableScopeByDelta(currentVariables, baseVariables, finalVariables) {
  const nextVariables = clonePairs(currentVariables);
  const baseByKey = variablesByKey(baseVariables);
  const finalByKey = variablesByKey(finalVariables);
  const changedKeys = new Set([...baseByKey.keys(), ...finalByKey.keys()]
    .filter((key) => !sameStructuredValue(baseByKey.get(key), finalByKey.get(key))));

  for (const key of changedKeys) {
    const finalVariable = finalByKey.get(key);
    const existingIndex = nextVariables.findIndex((variable) => variable?.key === key);
    if (!finalVariable) {
      removeVariablesByKey(nextVariables, key);
    } else if (existingIndex >= 0) {
      nextVariables[existingIndex] = { ...finalVariable };
      removeDuplicateVariablesByKey(nextVariables, key, existingIndex);
    } else {
      nextVariables.push({ ...finalVariable });
    }
  }

  return nextVariables;
}

function mergeCookieJarByDelta(currentCookies, baseCookies, finalCookies) {
  const nextCookies = cloneJson(currentCookies || []);
  const baseByIdentity = cookiesByIdentity(baseCookies);
  const finalByIdentity = cookiesByIdentity(finalCookies);
  const changedIdentities = new Set([...baseByIdentity.keys(), ...finalByIdentity.keys()]
    .filter((identity) => !sameStructuredValue(
      comparableCookie(baseByIdentity.get(identity)),
      comparableCookie(finalByIdentity.get(identity))
    )));

  for (const identity of changedIdentities) {
    const finalCookie = finalByIdentity.get(identity);
    const existingIndex = nextCookies.findIndex((cookie) => cookieIdentity(cookie) === identity);
    if (!finalCookie) {
      removeCookiesByIdentity(nextCookies, identity);
    } else if (existingIndex >= 0) {
      nextCookies[existingIndex] = cloneJson(finalCookie);
      removeDuplicateCookiesByIdentity(nextCookies, identity, existingIndex);
    } else {
      nextCookies.push(cloneJson(finalCookie));
    }
  }

  return nextCookies;
}

function variablesByKey(variables) {
  const byKey = new Map();
  for (const variable of variables || []) {
    const key = String(variable?.key || '').trim();
    if (key) {
      byKey.set(key, { ...variable, key });
    }
  }
  return byKey;
}

function cookiesByIdentity(cookies) {
  const byIdentity = new Map();
  for (const cookie of cookies || []) {
    const identity = cookieIdentity(cookie);
    if (identity) {
      byIdentity.set(identity, cookie);
    }
  }
  return byIdentity;
}

function cookieIdentity(cookie) {
  const name = String(cookie?.name || '').trim().toLowerCase();
  const domain = normalizeCookieDomain(cookie?.domain || '');
  const path = normalizeCookiePath(cookie?.path || '/');
  return name && domain ? `${name};${domain};${path}` : '';
}

function comparableCookie(cookie) {
  if (!cookie) {
    return null;
  }
  const { id, ...rest } = cookie;
  return rest;
}

function sameStructuredValue(left, right) {
  return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = sortObject(value[key]);
    return sorted;
  }, {});
}

function removeVariablesByKey(variables, key) {
  for (let index = variables.length - 1; index >= 0; index -= 1) {
    if (variables[index]?.key === key) {
      variables.splice(index, 1);
    }
  }
}

function removeDuplicateVariablesByKey(variables, key, keepIndex) {
  for (let index = variables.length - 1; index >= 0; index -= 1) {
    if (index !== keepIndex && variables[index]?.key === key) {
      variables.splice(index, 1);
      if (index < keepIndex) {
        keepIndex -= 1;
      }
    }
  }
}

function removeCookiesByIdentity(cookies, identity) {
  for (let index = cookies.length - 1; index >= 0; index -= 1) {
    if (cookieIdentity(cookies[index]) === identity) {
      cookies.splice(index, 1);
    }
  }
}

function removeDuplicateCookiesByIdentity(cookies, identity, keepIndex) {
  for (let index = cookies.length - 1; index >= 0; index -= 1) {
    if (index !== keepIndex && cookieIdentity(cookies[index]) === identity) {
      cookies.splice(index, 1);
      if (index < keepIndex) {
        keepIndex -= 1;
      }
    }
  }
}

function applyRequestSaveToWorkspace(workspace, payload) {
  if (payload?.authRefreshOwnerType) {
    return applyAuthRefreshRequestSaveToWorkspace(workspace, payload);
  }
  if (payload?.runnerId) {
    return applyRunnerRequestSaveToWorkspace(workspace, payload);
  }
  const nextWorkspace = {
    ...workspace,
    collections: Array.isArray(workspace?.collections) ? [...workspace.collections] : []
  };
  const requestId = payload?.requestId || payload?.request?.id || '';
  const collectionId = payload?.collectionId || '';
  let collectionIndex = nextWorkspace.collections.findIndex((collection) => collection.id === collectionId);
  let collection = collectionIndex >= 0 ? cloneJson(nextWorkspace.collections[collectionIndex]) : null;

  if (!collection) {
    if (!payload?.collectionShell) {
      throw new Error(`Collection "${collectionId}" was not found.`);
    }
    collection = {
      id: collectionId,
      name: payload.collectionShell.name || 'Untitled Collection',
      description: payload.collectionShell.description || '',
      auth: cloneJson(payload.collectionShell.auth || { type: 'none' }),
      scripts: cloneJson(payload.collectionShell.scripts || {}),
      certificates: Array.isArray(payload.collectionShell.certificates) ? cloneJson(payload.collectionShell.certificates) : [],
      variables: Array.isArray(payload.collectionVariables) ? clonePairs(payload.collectionVariables) : [],
      requests: [],
      folders: []
    };
    collectionIndex = nextWorkspace.collections.length;
  } else if (payload.collectionShell) {
    collection.name = payload.collectionShell.name || collection.name || 'Untitled Collection';
    collection.description = payload.collectionShell.description || '';
    collection.auth = cloneJson(payload.collectionShell.auth || { type: 'none' });
    collection.scripts = cloneJson(payload.collectionShell.scripts || {});
    if (Array.isArray(payload.collectionShell.certificates)) {
      collection.certificates = cloneJson(payload.collectionShell.certificates);
    }
  }

  if (!replaceRequestInCollection(collection, requestId, payload.request)) {
    const targetFolder = ensureFolderPath(collection, payload.folderPath || []);
    targetFolder.requests ||= [];
    targetFolder.requests.push(cloneJson(payload.request));
  }

  if (Array.isArray(payload.collectionVariables)) {
    collection.variables = clonePairs(payload.collectionVariables);
  }

  nextWorkspace.collections[collectionIndex] = collection;

  if (Array.isArray(payload.cookies)) {
    nextWorkspace.cookies = cloneJson(payload.cookies);
  }

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }

  return nextWorkspace;
}

function applyAuthRefreshRequestSaveToWorkspace(workspace, payload) {
  return payload.authRefreshOwnerType === 'performance'
    ? applyPerformanceAuthRefreshRequestSaveToWorkspace(workspace, payload)
    : applyRunnerAuthRefreshRequestSaveToWorkspace(workspace, payload);
}

function applyRunnerAuthRefreshRequestSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    runners: Array.isArray(workspace?.runners) ? [...workspace.runners] : []
  };
  const runnerId = payload?.runnerId || '';
  let runnerIndex = nextWorkspace.runners.findIndex((runner) => runner.id === runnerId);
  let runner = runnerIndex >= 0 ? cloneJson(nextWorkspace.runners[runnerIndex]) : null;

  if (!runner) {
    if (!payload?.runnerShell) {
      throw new Error(`Runner "${runnerId}" was not found.`);
    }
    runner = {
      id: runnerId,
      name: payload.runnerShell.name || 'Untitled Runner',
      environmentId: payload.runnerShell.environmentId || 'none',
      stopOnFailure: payload.runnerShell.stopOnFailure === true,
      allowEnvironmentMutation: payload.runnerShell.allowEnvironmentMutation === true,
      authRefresh: cloneJson(payload.runnerShell.authRefresh || payload.authRefresh || {}),
      requests: Array.isArray(payload.runnerShell.requests) ? cloneJson(payload.runnerShell.requests) : []
    };
    runnerIndex = nextWorkspace.runners.length;
  }

  const requestProperty = authRefreshRequestPropertyForSave(runner.authRefresh, payload) || 'request';
  runner.authRefresh = {
    ...(runner.authRefresh && typeof runner.authRefresh === 'object' ? runner.authRefresh : {}),
    [requestProperty]: cloneJson(payload.request)
  };
  nextWorkspace.runners[runnerIndex] = runner;

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }

  if (Array.isArray(payload.cookies)) {
    nextWorkspace.cookies = cloneJson(payload.cookies);
  }

  return nextWorkspace;
}

function applyPerformanceAuthRefreshRequestSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    performanceTests: Array.isArray(workspace?.performanceTests) ? [...workspace.performanceTests] : []
  };
  const performanceTestId = payload?.performanceTestId || '';
  let testIndex = nextWorkspace.performanceTests.findIndex((test) => test.id === performanceTestId);
  let test = testIndex >= 0 ? cloneJson(nextWorkspace.performanceTests[testIndex]) : null;

  if (!test) {
    if (!payload?.performanceShell) {
      throw new Error(`Performance test "${performanceTestId}" was not found.`);
    }
    test = cloneJson(payload.performanceShell);
    testIndex = nextWorkspace.performanceTests.length;
  }

  const requestProperty = authRefreshRequestPropertyForSave(test.authRefresh, payload) || 'request';
  test.authRefresh = {
    ...(test.authRefresh && typeof test.authRefresh === 'object' ? test.authRefresh : {}),
    [requestProperty]: cloneJson(payload.request)
  };
  nextWorkspace.performanceTests[testIndex] = test;

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }

  if (Array.isArray(payload.cookies)) {
    nextWorkspace.cookies = cloneJson(payload.cookies);
  }

  return nextWorkspace;
}

function applyRunnerRequestSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    runners: Array.isArray(workspace?.runners) ? [...workspace.runners] : []
  };
  const runnerId = payload?.runnerId || '';
  const requestId = payload?.requestId || payload?.request?.id || '';
  let runnerIndex = nextWorkspace.runners.findIndex((runner) => runner.id === runnerId);
  let runner = runnerIndex >= 0 ? cloneJson(nextWorkspace.runners[runnerIndex]) : null;

  if (!runner) {
    if (!payload?.runnerShell) {
      throw new Error(`Runner "${runnerId}" was not found.`);
    }
    runner = {
      id: runnerId,
      name: payload.runnerShell.name || 'Untitled Runner',
      environmentId: payload.runnerShell.environmentId || 'none',
      stopOnFailure: payload.runnerShell.stopOnFailure === true,
      allowEnvironmentMutation: payload.runnerShell.allowEnvironmentMutation === true,
      requests: []
    };
    runnerIndex = nextWorkspace.runners.length;
  }

  runner.requests = Array.isArray(runner.requests) ? runner.requests : [];
  const requestIndex = runner.requests.findIndex((request) => request.id === requestId);
  if (requestIndex >= 0) {
    runner.requests[requestIndex] = cloneJson(payload.request);
  } else {
    runner.requests.push(cloneJson(payload.request));
  }
  nextWorkspace.runners[runnerIndex] = runner;

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }

  return nextWorkspace;
}

function applyEnvironmentSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    environments: Array.isArray(workspace?.environments) ? [...workspace.environments] : []
  };
  const environmentId = payload?.environmentId || payload?.environment?.id || '';
  const environmentIndex = nextWorkspace.environments.findIndex((environment) => environment.id === environmentId);
  if (environmentIndex >= 0) {
    nextWorkspace.environments[environmentIndex] = cloneJson(payload.environment);
  } else {
    nextWorkspace.environments.push(cloneJson(payload.environment));
  }
  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }
  return nextWorkspace;
}

function applyCollectionSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    collections: Array.isArray(workspace?.collections) ? [...workspace.collections] : []
  };
  const collectionId = payload?.collectionId || payload?.collection?.id || '';
  const collectionIndex = nextWorkspace.collections.findIndex((collection) => collection.id === collectionId);
  if (collectionIndex >= 0) {
    nextWorkspace.collections[collectionIndex] = cloneJson(payload.collection);
  } else {
    nextWorkspace.collections.push(cloneJson(payload.collection));
  }
  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }
  return nextWorkspace;
}

function applyFolderSaveToWorkspace(workspace, payload) {
  const nextWorkspace = {
    ...workspace,
    collections: Array.isArray(workspace?.collections) ? [...workspace.collections] : []
  };
  const collectionId = payload?.collectionId || '';
  const folderId = payload?.folderId || payload?.folder?.id || '';
  let collectionIndex = nextWorkspace.collections.findIndex((collection) => collection.id === collectionId);
  let collection = collectionIndex >= 0 ? cloneJson(nextWorkspace.collections[collectionIndex]) : null;

  if (!collection) {
    if (!payload?.collectionShell) {
      throw new Error(`Collection "${collectionId}" was not found.`);
    }
    collection = {
      id: collectionId,
      name: payload.collectionShell.name || 'Untitled Collection',
      description: payload.collectionShell.description || '',
      auth: cloneJson(payload.collectionShell.auth || { type: 'none' }),
      scripts: cloneJson(payload.collectionShell.scripts || {}),
      variables: Array.isArray(payload.collectionShell.variables) ? clonePairs(payload.collectionShell.variables) : [],
      certificates: Array.isArray(payload.collectionShell.certificates) ? cloneJson(payload.collectionShell.certificates) : [],
      requests: [],
      folders: []
    };
    collectionIndex = nextWorkspace.collections.length;
  } else if (payload.collectionShell) {
    collection.name = payload.collectionShell.name || collection.name || 'Untitled Collection';
    collection.description = payload.collectionShell.description || '';
    collection.auth = cloneJson(payload.collectionShell.auth || { type: 'none' });
    collection.scripts = cloneJson(payload.collectionShell.scripts || {});
    if (Array.isArray(payload.collectionShell.variables)) {
      collection.variables = clonePairs(payload.collectionShell.variables);
    }
    if (Array.isArray(payload.collectionShell.certificates)) {
      collection.certificates = cloneJson(payload.collectionShell.certificates);
    }
  }

  if (!replaceFolderInCollection(collection, folderId, payload.folder)) {
    const folderPath = Array.isArray(payload.folderPath) ? payload.folderPath : [];
    const parentPath = folderPath.length && folderPath[folderPath.length - 1]?.id === folderId
      ? folderPath.slice(0, -1)
      : folderPath;
    const targetFolder = ensureFolderPath(collection, parentPath);
    targetFolder.folders ||= [];
    targetFolder.folders.push(cloneJson(payload.folder));
  }

  nextWorkspace.collections[collectionIndex] = collection;

  if (payload?.settings && typeof payload.settings === 'object') {
    nextWorkspace.settings = normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, payload.settings));
  }

  return nextWorkspace;
}

function applyWorkspaceSettingsSaveToWorkspace(workspace, settings) {
  return {
    ...workspace,
    settings: normalizeSettings(mergeWorkspaceSettingsForSave(workspace?.settings, settings))
  };
}

function mergeWorkspaceSettingsForSave(currentSettings, nextSettings) {
  const current = normalizeSettings(currentSettings || {});
  const next = nextSettings && typeof nextSettings === 'object' && !Array.isArray(nextSettings)
    ? nextSettings
    : {};
  return {
    ...current,
    appearance: mergeObject(current.appearance, next.appearance),
    diagnostics: {
      ...current.diagnostics,
      ...(isPlainObject(next.diagnostics) ? next.diagnostics : {}),
      logging: mergeObject(current.diagnostics?.logging, next.diagnostics?.logging),
      requestResponseLogging: mergeObject(current.diagnostics?.requestResponseLogging, next.diagnostics?.requestResponseLogging)
    },
    sandbox: {
      ...current.sandbox,
      ...(isPlainObject(next.sandbox) ? next.sandbox : {}),
      trustedCapabilities: mergeObject(current.sandbox?.trustedCapabilities, next.sandbox?.trustedCapabilities)
    },
    editor: mergeObject(current.editor, next.editor),
    tabs: mergeObject(current.tabs, next.tabs),
    modals: mergeObject(current.modals, next.modals),
    updates: mergeObject(current.updates, next.updates),
    request: mergeObject(current.request, next.request)
  };
}

function mergeObject(current, next) {
  return {
    ...(isPlainObject(current) ? current : {}),
    ...(isPlainObject(next) ? next : {})
  };
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function replaceRequestInCollection(collection, requestId, request) {
  collection.requests ||= [];
  const requestIndex = collection.requests.findIndex((candidate) => candidate.id === requestId);
  if (requestIndex >= 0) {
    collection.requests[requestIndex] = cloneJson(request);
    return true;
  }
  for (const folder of collection.folders || []) {
    if (replaceRequestInFolder(folder, requestId, request)) {
      return true;
    }
  }
  return false;
}

function replaceFolderInCollection(collection, folderId, folder) {
  collection.folders ||= [];
  const folderIndex = collection.folders.findIndex((candidate) => candidate.id === folderId);
  if (folderIndex >= 0) {
    collection.folders[folderIndex] = cloneJson(folder);
    return true;
  }
  for (const child of collection.folders || []) {
    if (replaceFolderInFolder(child, folderId, folder)) {
      return true;
    }
  }
  return false;
}

function replaceFolderInFolder(parentFolder, folderId, folder) {
  parentFolder.folders ||= [];
  const folderIndex = parentFolder.folders.findIndex((candidate) => candidate.id === folderId);
  if (folderIndex >= 0) {
    parentFolder.folders[folderIndex] = cloneJson(folder);
    return true;
  }
  for (const child of parentFolder.folders || []) {
    if (replaceFolderInFolder(child, folderId, folder)) {
      return true;
    }
  }
  return false;
}

function replaceRequestInFolder(folder, requestId, request) {
  folder.requests ||= [];
  const requestIndex = folder.requests.findIndex((candidate) => candidate.id === requestId);
  if (requestIndex >= 0) {
    folder.requests[requestIndex] = cloneJson(request);
    return true;
  }
  for (const child of folder.folders || []) {
    if (replaceRequestInFolder(child, requestId, request)) {
      return true;
    }
  }
  return false;
}

function ensureFolderPath(collection, folderPath) {
  let folders = collection.folders ||= [];
  let currentFolder = null;
  for (const segment of folderPath || []) {
    const folderId = segment?.id || '';
    let folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder) {
      folder = {
        id: folderId,
        name: segment?.name || 'Untitled Folder',
        description: segment?.description || '',
        auth: cloneJson(segment?.auth || { type: 'none' }),
        scripts: cloneJson(segment?.scripts || {}),
        variables: Array.isArray(segment?.variables) ? clonePairs(segment.variables) : [],
        requests: [],
        folders: []
      };
      folders.push(folder);
    }
    folder.requests ||= [];
    folder.folders ||= [];
    currentFolder = folder;
    folders = folder.folders;
  }
  return currentFolder || collection;
}

module.exports = {
  applyCollectionSaveToWorkspace,
  applyEnvironmentSaveToWorkspace,
  applyFolderSaveToWorkspace,
  applyCollectionRunMutationsToWorkspace,
  applyRequestSaveToWorkspace,
  applyWorkspaceSettingsSaveToWorkspace,
  applyScriptVariableMutationsToWorkspace,
  findWorkspaceAuthRefreshRequestContext,
  findWorkspaceRunnerRequestContext,
  findWorkspaceRequestContext,
  mergeCookieJarByDelta,
  mergeVariableScopeByDelta,
  updateWorkspaceRequestAuth
};
