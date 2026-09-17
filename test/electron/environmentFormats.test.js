const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ENVIRONMENT_FORMAT,
  exportEnvironmentDocument,
  exportEnvironmentToDotenv,
  exportEnvironmentToJson,
  importEnvironmentDocument,
  importEnvironmentFromDotenv,
  importEnvironmentFromText
} = require('../../src/core/import-export/environmentFormats');

test('exports and imports native environment documents with schema validation', () => {
  const environment = {
    id: 'env-1',
    name: 'Local',
    variables: [
      { enabled: true, key: 'baseUrl', value: 'https://example.test' },
      { enabled: false, key: 'disabled', value: 'secret' }
    ]
  };

  const document = exportEnvironmentDocument(environment);
  const imported = importEnvironmentDocument(document);
  const importedFromText = importEnvironmentFromText(exportEnvironmentToJson(environment));

  assert.equal(document.format, ENVIRONMENT_FORMAT);
  assert.deepEqual(imported, environment);
  assert.deepEqual(importedFromText, environment);
});

test('imports Postman environment documents', () => {
  const imported = importEnvironmentDocument({
    id: 'postman-env',
    name: 'Postman Env',
    values: [
      { key: 'baseUrl', value: 'https://example.test', enabled: true },
      { key: 'token', value: 'abc', enabled: false }
    ],
    _postman_variable_scope: 'environment'
  });

  assert.equal(imported.id, 'postman-env');
  assert.equal(imported.name, 'Postman Env');
  assert.deepEqual(imported.variables, [
    { enabled: true, key: 'baseUrl', value: 'https://example.test' },
    { enabled: false, key: 'token', value: 'abc' }
  ]);
});

test('exports Postman-compatible environment JSON', () => {
  const exported = JSON.parse(exportEnvironmentToJson({
    id: 'env-1',
    name: 'Local',
    variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }]
  }, 'postman'));

  assert.equal(exported.name, 'Local');
  assert.equal(exported._postman_variable_scope, 'environment');
  assert.deepEqual(exported.values, [{
    key: 'baseUrl',
    value: 'https://example.test',
    enabled: true,
    type: 'default'
  }]);
});

test('exports every environment variable to .env and imports standard assignments', () => {
  const exported = exportEnvironmentToDotenv({
    id: 'env-1',
    name: 'Local',
    variables: [
      { enabled: true, key: 'BASE_URL', value: 'https://example.test' },
      { enabled: false, key: 'DISABLED_TOKEN', value: 'not-stripped' },
      { enabled: true, key: 'GREETING', value: 'hello world' }
    ]
  });

  assert.equal(exported, 'BASE_URL=https://example.test\nDISABLED_TOKEN=not-stripped\nGREETING="hello world"\n');
  const imported = importEnvironmentFromDotenv('# local values\nexport BASE_URL=https://example.test\nGREETING="hello world"\nTOKEN=abc # comment\n');
  assert.equal(imported.name, 'Imported Environment');
  assert.deepEqual(imported.variables, [
    { enabled: true, key: 'BASE_URL', value: 'https://example.test' },
    { enabled: true, key: 'GREETING', value: 'hello world' },
    { enabled: true, key: 'TOKEN', value: 'abc' }
  ]);
  assert.deepEqual(importEnvironmentFromText(exported).variables, [
    { enabled: true, key: 'BASE_URL', value: 'https://example.test' },
    { enabled: true, key: 'DISABLED_TOKEN', value: 'not-stripped' },
    { enabled: true, key: 'GREETING', value: 'hello world' }
  ]);
});

test('rejects malformed environment imports and unsupported export formats', () => {
  assert.throws(() => importEnvironmentFromText('{bad json'), /Failed to parse environment JSON/);
  assert.throws(() => importEnvironmentDocument({ format: ENVIRONMENT_FORMAT }), /environment/);
  assert.throws(() => exportEnvironmentToJson({ id: 'env-1', name: 'Local', variables: [] }, 'curl'), /Unsupported environment export format/);
});
