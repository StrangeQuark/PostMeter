const assert = require('node:assert/strict');
const test = require('node:test');
const { csvValue } = require('../../src/core/import-export/csvSafety');

test('CSV values neutralize spreadsheet formulas after whitespace and controls', () => {
  for (const value of ['=1+1', '+1', '-1', '@cmd', '  =1', '\t+1', '\r-1']) {
    assert.match(csvValue(value), /^'?/);
    assert.match(csvValue(value), /'/);
  }
  assert.equal(csvValue(42), '42');
});
