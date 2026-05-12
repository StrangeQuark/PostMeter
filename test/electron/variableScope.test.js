const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getVariable,
  runtimeEnvironment,
  setVariable,
  unsetVariable
} = require('../../src/core/variableScope');

test('builds runtime environment with request variables overriding collection variables, which override environment variables', () => {
  const runtime = runtimeEnvironment(
    [
      { enabled: true, key: 'baseUrl', value: 'https://collection.example.test' },
      { enabled: true, key: 'shared', value: 'collection' },
      { enabled: true, key: 'collectionOnly', value: 'yes' }
    ],
    {
      id: 'env',
      name: 'Local',
      variables: [
        { enabled: true, key: 'baseUrl', value: 'https://env.example.test' },
        { enabled: true, key: 'shared', value: 'environment' },
        { enabled: false, key: 'disabled', value: 'ignored' }
      ]
    },
    [
      { enabled: true, key: 'baseUrl', value: 'https://request.example.test' },
      { enabled: true, key: 'requestOnly', value: 'yes' }
    ]
  );

  assert.equal(runtime.id, 'env');
  assert.equal(getVariable(runtime.variables, 'baseUrl'), 'https://request.example.test');
  assert.equal(getVariable(runtime.variables, 'shared'), 'collection');
  assert.equal(getVariable(runtime.variables, 'collectionOnly'), 'yes');
  assert.equal(getVariable(runtime.variables, 'requestOnly'), 'yes');
  assert.equal(getVariable(runtime.variables, 'disabled'), undefined);
});

test('falls back through request, collection, environment, and globals without disabled variables shadowing lower scopes', () => {
  const runtime = runtimeEnvironment(
    [
      { enabled: true, key: 'collectionOnly', value: 'collection-value' },
      { enabled: true, key: 'collectionBeatsEnv', value: 'collection-value' },
      { enabled: false, key: 'disabledCollectionFallsBackToEnv', value: 'disabled-collection' },
      { enabled: true, key: 'disabledRequestFallsBackToCollection', value: 'collection-value' },
      { enabled: true, key: 'shared', value: 'collection-value' }
    ],
    {
      id: 'env',
      name: 'Local',
      variables: [
        { enabled: true, key: 'envOnly', value: 'env-value' },
        { enabled: true, key: 'collectionBeatsEnv', value: 'env-value' },
        { enabled: true, key: 'disabledCollectionFallsBackToEnv', value: 'env-value' },
        { enabled: true, key: 'globalBeatsEnv', value: 'env-value' },
        { enabled: true, key: 'shared', value: 'env-value' }
      ]
    },
    [
      { enabled: true, key: 'requestOnly', value: 'request-value' },
      { enabled: true, key: 'shared', value: 'request-value' },
      { enabled: false, key: 'disabledRequestFallsBackToCollection', value: 'disabled-request' }
    ],
    {
      globals: [
        { enabled: true, key: 'globalOnly', value: 'global-value' },
        { enabled: true, key: 'globalBeatsEnv', value: 'global-value' }
      ]
    }
  );

  assert.equal(getVariable(runtime.variables, 'requestOnly'), 'request-value');
  assert.equal(getVariable(runtime.variables, 'collectionOnly'), 'collection-value');
  assert.equal(getVariable(runtime.variables, 'envOnly'), 'env-value');
  assert.equal(getVariable(runtime.variables, 'globalOnly'), 'global-value');
  assert.equal(getVariable(runtime.variables, 'shared'), 'request-value');
  assert.equal(getVariable(runtime.variables, 'collectionBeatsEnv'), 'collection-value');
  assert.equal(getVariable(runtime.variables, 'disabledRequestFallsBackToCollection'), 'collection-value');
  assert.equal(getVariable(runtime.variables, 'disabledCollectionFallsBackToEnv'), 'env-value');
  assert.equal(getVariable(runtime.variables, 'globalBeatsEnv'), 'env-value');
});

test('mutates variable arrays predictably', () => {
  const variables = [];

  setVariable(variables, 'token', 'one');
  assert.equal(getVariable(variables, 'token'), 'one');

  setVariable(variables, 'token', 'two');
  assert.equal(getVariable(variables, 'token'), 'two');

  unsetVariable(variables, 'token');
  assert.equal(getVariable(variables, 'token'), undefined);
});
