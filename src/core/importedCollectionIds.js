const { folderModel, newId, requestModel } = require('./models');

function regenerateCollectionIds(collection) {
  collection.id = newId();
  for (const certificate of collection.certificates || []) {
    certificate.id = newId();
  }
  for (const request of collection.requests || []) {
    regenerateRequestIds(request);
  }
  for (const folder of collection.folders || []) {
    regenerateFolderIds(folder);
  }
}

function regenerateFolderIds(folder) {
  folder.id = newId();
  folder.requests = (folder.requests || []).map((request) => {
    const normalized = requestModel(request);
    regenerateRequestIds(normalized);
    return normalized;
  });
  folder.folders = (folder.folders || []).map((child) => {
    const normalized = folderModel(child);
    regenerateFolderIds(normalized);
    return normalized;
  });
}

function regenerateRequestIds(request) {
  request.id = newId();
}

module.exports = {
  regenerateCollectionIds,
  regenerateFolderIds,
  regenerateRequestIds
};
