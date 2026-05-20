const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveEnvironmentValue } = require('../../src/core/workspace/environmentResolver');

test('resolves enabled environment variables and leaves unknown tokens unchanged', () => {
  const environment = {
    variables: [
      { enabled: true, key: 'baseUrl', value: 'https://api.example.test' },
      { enabled: false, key: 'disabled', value: 'hidden' },
      { enabled: true, key: 'name.with-dash_1', value: 'resolved' }
    ]
  };

  assert.equal(
    resolveEnvironmentValue('{{ baseUrl }}/users/{{missing}}/{{name.with-dash_1}}/{{disabled}}', environment),
    'https://api.example.test/users/{{missing}}/resolved/{{disabled}}'
  );
  assert.equal(
    resolveEnvironmentValue('${baseUrl}/users/${missing}/${name.with-dash_1}/${disabled}', environment),
    'https://api.example.test/users/${missing}/resolved/${disabled}'
  );
});

test('returns input text when no environment is active', () => {
  assert.equal(resolveEnvironmentValue('https://example.test/{{path}}', null), 'https://example.test/{{path}}');
});
