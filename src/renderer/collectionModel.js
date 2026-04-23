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
      return { request, folder: null };
    }
  }
  for (const folder of collection.folders || []) {
    const found = findRequestInFolder(folder, requestId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRequestInFolder(folder, requestId) {
  for (const request of folder.requests || []) {
    if (request.id === requestId) {
      return { request, folder };
    }
  }
  for (const child of folder.folders || []) {
    const found = findRequestInFolder(child, requestId);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    allFolderNames,
    allRequestNames,
    findFolder,
    findFolderRecursive,
    findRequest,
    findRequestInFolder,
    firstRequestInCollection,
    firstRequestInFolder,
    removeFolder,
    removeFolderFromParent,
    removeRequestFromCollection,
    removeRequestFromFolder,
    uniqueName,
    walkCollectionRequests,
    walkFolderRequests
  };
}
