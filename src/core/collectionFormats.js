const {
  curlExportExclusions,
  exportCurlCollection,
  exportCurlRequest,
  importCurlCommand,
  splitCommandLine
} = require('./curlFormats');
const {
  exportOpenApiCollection,
  importOpenApiDocument,
  looksLikeOpenApiDocument
} = require('./openApiFormats');
const {
  exportPostmanCollection,
  importPostmanCollection,
  looksLikePostmanCollection
} = require('./postmanImporter');

module.exports = {
  curlExportExclusions,
  exportCurlCollection,
  exportCurlRequest,
  exportOpenApiCollection,
  exportPostmanCollection,
  importCurlCommand,
  importOpenApiDocument,
  importPostmanCollection,
  looksLikeOpenApiDocument,
  looksLikePostmanCollection,
  splitCommandLine
};
