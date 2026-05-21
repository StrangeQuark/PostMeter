const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const TEST_PLAN_PATH = path.join(PROJECT_ROOT, 'TEST_PLAN.md');

test('V1 test plan has no partial, missing, or deferred matrix rows', () => {
  const plan = fs.readFileSync(TEST_PLAN_PATH, 'utf8');
  const rows = plan
    .split('\n')
    .filter((line) => /^\| [A-Z]+[A-Z0-9-]* \|/.test(line))
    .map(parseRow)
    .filter((row) => row.id && row.id !== 'ID');

  assert.ok(rows.length > 200, 'expected the full application test matrix');
  const badRows = rows.filter((row) => ['Partial', 'Missing', 'Deferred'].includes(row.status));
  assert.deepEqual(badRows, []);
  assert.doesNotMatch(plan, /\bDeferred\b/i);
  assert.doesNotMatch(plan, /\|\s*Partial\s*\|/);
});

function parseRow(line) {
  const cells = line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  return {
    id: cells[0],
    status: cells[5] || ''
  };
}
