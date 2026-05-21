const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CHECKLIST_PATH = path.join(PROJECT_ROOT, 'docs', 'V1_RELEASE_REVIEW_CHECKLIST.md');

test('V1 release review checklist covers docs, accessibility, soak, offline, and artifact evidence', () => {
  const checklist = fs.readFileSync(CHECKLIST_PATH, 'utf8');
  for (const requiredHeading of [
    'Public Docs Claims',
    'Architecture Drift',
    'Compatibility Docs',
    'Security And Privacy Docs',
    'Troubleshooting Docs',
    'Keyboard And Accessibility',
    'Long-Running Stability',
    'Offline Local-First Behavior',
    'Final Artifact Evidence'
  ]) {
    assert.match(checklist, new RegExp(`## ${escapeRegExp(requiredHeading)}`));
  }

  for (const requiredReference of [
    'README.md',
    'docs/ARCHITECTURE.md',
    'docs/COMPATIBILITY.md',
    'docs/SECURITY.md',
    'docs/TROUBLESHOOTING.md',
    'TEST_PLAN.md',
    'npm run check',
    'npm run ux:accessibility:validate',
    'npm run test:ui:regression',
    'npm run test:ui:typography',
    'npm run test:ui:snapshot',
    'npm run release:gate'
  ]) {
    assert.match(checklist, new RegExp(escapeRegExp(requiredReference)), `Checklist must reference ${requiredReference}`);
  }

  assert.match(checklist, /keyboard-only pass/i);
  assert.match(checklist, /one-hour local soak/i);
  assert.match(checklist, /offline smoke/i);
  assert.match(checklist, /no telemetry/i);
  assert.doesNotMatch(checklist, /\bDeferred\b/i);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
