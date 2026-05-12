const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getVariable,
  runtimeEnvironment,
  setVariable,
  unsetVariable
} = require('../../src/core/variableScope');

test('builds runtime environment with environment and local variables overriding collection variables', () => {
  const runtime = runtimeEnvironment(
    [
      { enabled: true, key: 'baseUrl', value: 'https://collection.example.test' },
      { enabled: true, key: 'collectionOnly', value: 'yes' }
    ],
    {
      id: 'env',
      name: 'Local',
      variables: [
        { enabled: true, key: 'baseUrl', value: 'https://env.example.test' },
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
  assert.equal(getVariable(runtime.variables, 'collectionOnly'), 'yes');
  assert.equal(getVariable(runtime.variables, 'requestOnly'), 'yes');
  assert.equal(getVariable(runtime.variables, 'disabled'), undefined);
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
