const assert = require('node:assert/strict');
const test = require('node:test');
const {
  csvVariableNames,
  csvVariablesConfigured,
  csvVariablesEnabled,
  csvVariablesToIterationRows,
  normalizeCsvVariableData,
  normalizeCsvVariableDataDefaultOff,
  parseCsvRecords,
  parseCsvVariableSchema
} = require('../../src/core/csvVariables');

test('parses CSV variable schema and values into iteration rows', () => {
  const definition = {
    schema: 'requestName,requestUrl,requestBody'
  };
  const rows = csvVariablesToIterationRows(definition, [
    'request1,https://api.example.test/one,"{""id"":1,""name"":""one""}"',
    'request2,https://api.example.test/two,"{""id"":2,""name"":""two""}"'
  ].join('\n'));

  assert.deepEqual(parseCsvVariableSchema(definition.schema), ['requestName', 'requestUrl', 'requestBody']);
  assert.deepEqual(rows[0], [
    { enabled: true, key: 'requestName', value: 'request1' },
    { enabled: true, key: 'requestUrl', value: 'https://api.example.test/one' },
    { enabled: true, key: 'requestBody', value: '{"id":1,"name":"one"}' }
  ]);
  assert.equal(rows[1][2].value, '{"id":2,"name":"two"}');
});

test('CSV parser handles quoted commas, escaped quotes, blank lines, and trailing empty fields', () => {
  assert.deepEqual(parseCsvRecords('a,"b,c","d""e"\n\nx,y,'), [
    ['a', 'b,c', 'd"e'],
    ['x', 'y', '']
  ]);
});

test('CSV variable helpers validate duplicate schema names and row counts', () => {
  assert.throws(
    () => parseCsvVariableSchema('name,name'),
    /duplicate variable "name"/
  );
  assert.throws(
    () => csvVariablesToIterationRows({ schema: 'name,url' }, 'only-one-column'),
    /row 1 has 1 value/
  );
  assert.throws(
    () => csvVariablesToIterationRows({ schema: 'name' }, 'one', { requiredRows: 2 }),
    /has 1 row, but this run needs 2/
  );
  assert.throws(
    () => parseCsvRecords('"unfinished'),
    /unterminated quoted field/
  );
});

test('CSV variable helpers can loop rows when fewer rows are provided than required', () => {
  const rows = csvVariablesToIterationRows({
    schema: 'name,url',
    loopRows: true
  }, [
    'one,https://api.example.test/one',
    'two,https://api.example.test/two',
    'three,https://api.example.test/three'
  ].join('\n'), { requiredRows: 10 });

  assert.deepEqual(rows.map((row) => row[0].value), [
    'one',
    'two',
    'three',
    'one',
    'two',
    'three',
    'one',
    'two',
    'three',
    'one'
  ]);
  assert.notEqual(rows[0][0], rows[3][0]);
});

test('CSV variable helpers can continue without CSV data when rows run out', () => {
  const rows = csvVariablesToIterationRows({
    schema: 'name,url',
    continueWithoutRows: true
  }, [
    'one,https://api.example.test/one',
    'two,https://api.example.test/two',
    'three,https://api.example.test/three'
  ].join('\n'), { requiredRows: 10 });

  assert.deepEqual(rows.map((row) => row[0].value), ['one', 'two', 'three']);
});

test('CSV variable helpers can reuse the first data row for every required request', () => {
  const rows = csvVariablesToIterationRows({
    schema: 'username,password',
    reuseFirstRow: true
  }, [
    'alice,correct-horse',
    'bob'
  ].join('\n'), { requiredRows: 4 });

  assert.deepEqual(rows.map((row) => row.map((variable) => variable.value)), [
    ['alice', 'correct-horse'],
    ['alice', 'correct-horse'],
    ['alice', 'correct-horse'],
    ['alice', 'correct-horse']
  ]);
  assert.notEqual(rows[0][0], rows[1][0]);
});

test('normalizes CSV variable definitions and exposes configured names', () => {
  const normalized = normalizeCsvVariableData({
    enabled: false,
    schema: ' name , url ',
    values: 'request,https://example.test',
    filePath: '/tmp/variables.csv',
    sourceName: 'variables.csv',
    reuseFirstRow: true,
    loopRows: true,
    continueWithoutRows: true,
    ignored: true
  });

  assert.deepEqual(normalized, {
    enabled: false,
    schema: ' name , url ',
    values: 'request,https://example.test',
    filePath: '/tmp/variables.csv',
    sourceName: 'variables.csv',
    activeSource: 'file',
    reuseFirstRow: true,
    loopRows: false,
    continueWithoutRows: false
  });
  assert.equal(normalizeCsvVariableData({ values: 'inline-row' }).activeSource, 'inline');
  assert.equal(normalizeCsvVariableData({ values: 'inline-row', filePath: '/tmp/variables.csv', activeSource: 'inline' }).activeSource, 'inline');
  assert.equal(normalizeCsvVariableData({ continueWithoutRows: true }).continueWithoutRows, true);
  assert.equal(normalizeCsvVariableData({ loopRows: true, continueWithoutRows: true }).loopRows, true);
  assert.equal(normalizeCsvVariableData({ loopRows: true, continueWithoutRows: true }).continueWithoutRows, false);
  assert.equal(normalizeCsvVariableData({ values: 'inline-row' }).values, 'inline-row');
  assert.equal(csvVariablesConfigured(normalized), true);
  assert.equal(csvVariablesEnabled(normalized), false);
  assert.deepEqual(csvVariableNames(normalized), ['name', 'url']);
  assert.equal(csvVariablesEnabled({ schema: 'name', values: '', filePath: '' }), false);
});

test('default-off CSV normalization disables empty definitions without disabling legacy configured data', () => {
  assert.equal(normalizeCsvVariableData().enabled, true);
  assert.equal(normalizeCsvVariableDataDefaultOff().enabled, false);
  assert.equal(normalizeCsvVariableDataDefaultOff({}).enabled, false);
  assert.equal(normalizeCsvVariableDataDefaultOff({ schema: 'name', values: 'alice' }).enabled, true);
  assert.equal(normalizeCsvVariableDataDefaultOff({ enabled: false, schema: 'name', values: 'alice' }).enabled, false);
});
