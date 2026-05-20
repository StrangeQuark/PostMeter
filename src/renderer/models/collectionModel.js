function walkCollectionRequests(collection, visitor) {
  for (const request of collection.requests || []) {
    visitor(request);
  }
  for (const folder of collection.folders || []) {
    walkFolderRequests(folder, visitor);
  }
}

function walkFolderRequests(folder, visitor) {
  for (const request of folder.requests || []) {
    visitor(request);
  }
  for (const child of folder.folders || []) {
    walkFolderRequests(child, visitor);
  }
}

function firstRequestInCollection(collection) {
  if (collection.requests?.length) {
    return { request: collection.requests[0], folderId: null };
  }
  for (const folder of collection.folders || []) {
    const found = firstRequestInFolder(folder);
    if (found) {
      return found;
    }
  }
  return null;
}

function firstRequestInFolder(folder) {
  if (folder.requests?.length) {
    return { request: folder.requests[0], folderId: folder.id };
  }
  for (const child of folder.folders || []) {
    const found = firstRequestInFolder(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequest(collection, requestId) {
  for (const request of collection.requests || []) {
    if (request.id === requestId) {
      return { request, folder: null, folders: [] };
    }
  }
  for (const folder of collection.folders || []) {
    const found = findRequestInFolder(folder, requestId, []);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequestInFolder(folder, requestId, parentPath = []) {
  const folders = [...parentPath, folder].filter(Boolean);
  for (const request of folder.requests || []) {
    if (request.id === requestId) {
      return { request, folder, folders };
    }
  }
  for (const child of folder.folders || []) {
    const found = findRequestInFolder(child, requestId, folders);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolder(collection, folderId) {
  for (const folder of collection.folders || []) {
    const found = findFolderRecursive(folder, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolderPath(collection, folderId) {
  for (const folder of collection.folders || []) {
    const found = findFolderPathRecursive(folder, folderId, []);
    if (found) {
      return found;
    }
  }
  return [];
}

function findFolderPathRecursive(folder, folderId, parentPath = []) {
  const path = [...parentPath, folder].filter(Boolean);
  if (folder.id === folderId) {
    return path;
  }
  for (const child of folder.folders || []) {
    const found = findFolderPathRecursive(child, folderId, path);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFolderRecursive(folder, folderId) {
  if (folder.id === folderId) {
    return folder;
  }
  for (const child of folder.folders || []) {
    const found = findFolderRecursive(child, folderId);
    if (found) {
      return found;
    }
  }
  return null;
}

function removeFolder(collection, folderId) {
  const index = (collection.folders || []).findIndex((folder) => folder.id === folderId);
  if (index >= 0) {
    collection.folders.splice(index, 1);
    return true;
  }
  for (const folder of collection.folders || []) {
    if (removeFolderFromParent(folder, folderId)) {
      return true;
    }
  }
  return false;
}

function removeFolderFromParent(parent, folderId) {
  const index = (parent.folders || []).findIndex((folder) => folder.id === folderId);
  if (index >= 0) {
    parent.folders.splice(index, 1);
    return true;
  }
  for (const child of parent.folders || []) {
    if (removeFolderFromParent(child, folderId)) {
      return true;
    }
  }
  return false;
}

function removeRequestFromCollection(collection, requestId) {
  const index = (collection.requests || []).findIndex((request) => request.id === requestId);
  if (index >= 0) {
    collection.requests.splice(index, 1);
    return true;
  }
  for (const folder of collection.folders || []) {
    if (removeRequestFromFolder(folder, requestId)) {
      return true;
    }
  }
  return false;
}

function removeRequestFromFolder(folder, requestId) {
  const index = (folder.requests || []).findIndex((request) => request.id === requestId);
  if (index >= 0) {
    folder.requests.splice(index, 1);
    return true;
  }
  for (const child of folder.folders || []) {
    if (removeRequestFromFolder(child, requestId)) {
      return true;
    }
  }
  return false;
}

function allRequestNames(collection) {
  const names = [...(collection.requests || []).map((request) => request.name)];
  for (const folder of collection.folders || []) {
    collectFolderRequestNames(folder, names);
  }
  return names;
}

function allFolderNames(collection) {
  const names = [];
  for (const folder of collection.folders || []) {
    collectFolderNames(folder, names);
  }
  return names;
}

function collectFolderNames(folder, names) {
  names.push(folder.name);
  for (const child of folder.folders || []) {
    collectFolderNames(child, names);
  }
}

function collectFolderRequestNames(folder, names) {
  names.push(...(folder.requests || []).map((request) => request.name));
  for (const child of folder.folders || []) {
    collectFolderRequestNames(child, names);
  }
}

function uniqueName(baseName, existingNames) {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix++;
  }
  return `${baseName} ${suffix}`;
}

function normalizeCollectionTreeCollapseSet(value) {
  const values = value instanceof Set
    ? Array.from(value)
    : Array.isArray(value)
      ? value
      : [];
  return new Set(values.map((item) => String(item || '').trim()).filter(Boolean));
}

function ensureCollectionTreeCollapseState(state = {}) {
  const target = state && typeof state === 'object' ? state : {};
  target.collapsedCollectionIds = normalizeCollectionTreeCollapseSet(target.collapsedCollectionIds);
  target.collapsedFolderIds = normalizeCollectionTreeCollapseSet(target.collapsedFolderIds);
  return target;
}

function collectionTreeItemHasChildren(item) {
  return Boolean((item?.requests || []).length || (item?.folders || []).length);
}

function collectionTreeCollapseSetForKind(state, kind) {
  const normalizedState = ensureCollectionTreeCollapseState(state);
  if (kind === 'collection') {
    return normalizedState.collapsedCollectionIds;
  }
  if (kind === 'folder') {
    return normalizedState.collapsedFolderIds;
  }
  return null;
}

function isCollectionTreeItemCollapsed(state, kind, id) {
  const normalizedId = String(id || '').trim();
  const collapseSet = normalizedId ? collectionTreeCollapseSetForKind(state, kind) : null;
  return collapseSet?.has(normalizedId) === true;
}

function setCollectionTreeItemCollapsed(state, kind, id, collapsed) {
  const normalizedId = String(id || '').trim();
  const collapseSet = normalizedId ? collectionTreeCollapseSetForKind(state, kind) : null;
  if (!collapseSet) {
    return false;
  }
  if (collapsed) {
    collapseSet.add(normalizedId);
  } else {
    collapseSet.delete(normalizedId);
  }
  return true;
}

function toggleCollectionTreeItemCollapsed(state, kind, id) {
  const nextCollapsed = !isCollectionTreeItemCollapsed(state, kind, id);
  return setCollectionTreeItemCollapsed(state, kind, id, nextCollapsed) ? nextCollapsed : false;
}

function collapseAllCollectionTreeItems(state, collections = []) {
  const normalizedState = ensureCollectionTreeCollapseState(state);
  for (const collection of collections || []) {
    if (collection?.id && collectionTreeItemHasChildren(collection)) {
      normalizedState.collapsedCollectionIds.add(String(collection.id));
    }
    for (const folder of collection?.folders || []) {
      collapseFolderTreeItems(normalizedState, folder);
    }
  }
  pruneCollectionTreeCollapseState(normalizedState, collections);
  return normalizedState;
}

function collapseFolderTreeItems(state, folder) {
  if (folder?.id && collectionTreeItemHasChildren(folder)) {
    state.collapsedFolderIds.add(String(folder.id));
  }
  for (const child of folder?.folders || []) {
    collapseFolderTreeItems(state, child);
  }
}

function pruneCollectionTreeCollapseState(state, collections = []) {
  const normalizedState = ensureCollectionTreeCollapseState(state);
  const collectionIds = new Set();
  const folderIds = new Set();
  for (const collection of collections || []) {
    if (collection?.id) {
      collectionIds.add(String(collection.id));
    }
    for (const folder of collection?.folders || []) {
      collectFolderIds(folder, folderIds);
    }
  }
  pruneCollapseSet(normalizedState.collapsedCollectionIds, collectionIds);
  pruneCollapseSet(normalizedState.collapsedFolderIds, folderIds);
  return normalizedState;
}

function collectFolderIds(folder, folderIds) {
  if (folder?.id) {
    folderIds.add(String(folder.id));
  }
  for (const child of folder?.folders || []) {
    collectFolderIds(child, folderIds);
  }
}

function pruneCollapseSet(collapseSet, allowedIds) {
  for (const id of Array.from(collapseSet)) {
    if (!allowedIds.has(id)) {
      collapseSet.delete(id);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    allFolderNames,
    allRequestNames,
    collapseAllCollectionTreeItems,
    collectionTreeItemHasChildren,
    collectionTreeCollapseSetForKind,
    ensureCollectionTreeCollapseState,
    findFolder,
    findFolderPath,
    findFolderPathRecursive,
    findFolderRecursive,
    findRequest,
    findRequestInFolder,
    firstRequestInCollection,
    firstRequestInFolder,
    isCollectionTreeItemCollapsed,
    normalizeCollectionTreeCollapseSet,
    pruneCollectionTreeCollapseState,
    removeFolder,
    removeFolderFromParent,
    removeRequestFromCollection,
    removeRequestFromFolder,
    setCollectionTreeItemCollapsed,
    toggleCollectionTreeItemCollapsed,
    uniqueName,
    walkCollectionRequests,
    walkFolderRequests
  };
}
