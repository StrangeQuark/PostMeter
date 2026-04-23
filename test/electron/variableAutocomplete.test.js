const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVariableSuggestions,
  findVariableToken,
  isVariableAutocompleteEligible,
  menuPositionFromAnchor,
  replaceVariableToken
} = require('../../src/renderer/variableAutocomplete');

test('variable autocomplete only applies to editable non-script text inputs', () => {
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'text', id: 'urlInput' }), true);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'TEXTAREA', id: 'bodyInput' }), true);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'TEXTAREA', id: 'preRequestScriptInput' }), false);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'number', id: 'loadRequests' }), false);
  assert.equal(isVariableAutocompleteEligible({ tagName: 'INPUT', type: 'text', id: 'authOauthUserCodeInput', readOnly: true }), false);
});

test('variable autocomplete finds the active token around the cursor', () => {
  assert.deepEqual(findVariableToken('Bearer {{tok', 12), {
    start: 7,
    end: 12,
    query: 'tok'
  });
  assert.deepEqual(findVariableToken('x={{tenant}}', 8), {
    start: 2,
    end: 12,
    query: 'tena'
  });
  assert.equal(findVariableToken('{{token}}', 9), null);
  assert.equal(findVariableToken('no token here', 5), null);
});

test('variable autocomplete suggestions sort keys and filter by prefix before contains matches', () => {
  assert.deepEqual(buildVariableSuggestions([
    { enabled: true, key: 'zeta', value: '3' },
    { enabled: true, key: 'token', value: '1' },
    { enabled: true, key: 'refreshToken', value: '2' },
    { enabled: false, key: 'disabled', value: '4' },
    { enabled: true, key: 'token', value: 'override' }
  ], 'to'), [
    { key: 'token', value: 'override' },
    { key: 'refreshToken', value: '2' }
  ]);
});

test('variable autocomplete replaces the open token with the selected environment variable', () => {
  const token = findVariableToken('Authorization: Bearer {{tok', 27);
  assert.deepEqual(replaceVariableToken('Authorization: Bearer {{tok', token, 'token'), {
    value: 'Authorization: Bearer {{token}}',
    selectionStart: 31,
    selectionEnd: 31
  });
});

test('variable autocomplete positions the menu from the token anchor rectangle', () => {
  assert.deepEqual(
    menuPositionFromAnchor(
      { left: 186, top: 120, bottom: 138 },
      220,
      140,
      1280,
      720
    ),
    { left: 186, top: 142 }
  );
});
