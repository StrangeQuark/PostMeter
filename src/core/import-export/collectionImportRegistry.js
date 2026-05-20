const { exportPostmanCollection, importPostmanCollection } = require('./postmanImporter');
const { exportCurlCollection, importCurlCommand, looksLikeCurlContent } = require('./curlFormats');
const { exportOpenApiCollection, importOpenApiDocument, looksLikeOpenApiDocument } = require('./openApiFormats');
const { migrate } = require('../workspace/workspaceMigrations');
const { regenerateCollectionIds } = require('./importedCollectionIds');
const {
  looksLikeNativeWorkspace,
  normalizeWorkspace,
  parseStructuredCollectionContent
} = require('../workspace/workspacePersistence');

const importHandlers = [
  {
    name: 'native-workspace',
    canImport({ parsed }) {
      return looksLikeNativeWorkspace(parsed);
    },
    import({ parsed }) {
      migrate(parsed);
      const workspace = normalizeWorkspace(parsed);
      if (!workspace.collections.length) {
        throw new Error('Imported file does not contain any collections.');
      }
      return workspace.collections[0];
    }
  },
  {
    name: 'openapi',
    canImport({ parsed }) {
      return looksLikeOpenApiDocument(parsed);
    },
    import({ parsed }) {
      return importOpenApiDocument(parsed);
    }
  },
  {
    name: 'curl',
    canImport({ content }) {
      return looksLikeCurlContent(content);
    },
    import({ content }) {
      return importCurlCommand(content);
    }
  },
  {
    name: 'postman',
    canImport({ parsed }) {
      return Boolean(parsed);
    },
    import({ parsed }) {
      return importPostmanCollection(parsed);
    }
  }
];

const exportHandlers = {
  postman(collection) {
    return JSON.stringify(exportPostmanCollection(collection), null, 2);
  },
  openapi(collection) {
    return JSON.stringify(exportOpenApiCollection(collection), null, 2);
  },
  curl(collection) {
    return exportCurlCollection(collection);
  }
};

function importCollectionFromContent(content) {
  const parsed = parseStructuredCollectionContent(content);
  for (const handler of importHandlers) {
    if (!handler.canImport({ content, parsed })) {
      continue;
    }
    try {
      const collection = handler.import({ content, parsed });
      regenerateCollectionIds(collection);
      return collection;
    } catch (error) {
      if (handler.name !== 'postman') {
        throw error;
      }
      const unsupported = new Error('File is not a supported PostMeter, Postman, OpenAPI, or curl collection.');
      unsupported.cause = error;
      throw unsupported;
    }
  }
  const error = new Error('File is not a supported PostMeter, Postman, OpenAPI, or curl collection.');
  error.cause = new Error('No compatible collection import handler matched the file contents.');
  throw error;
}

function exportCollectionByFormat(collection, format, workspace) {
  const exporter = exportHandlers[format];
  if (exporter) {
    return exporter(collection);
  }
  return JSON.stringify(workspace, null, 2);
}

module.exports = {
  exportCollectionByFormat,
  importCollectionFromContent,
  importHandlers
};
