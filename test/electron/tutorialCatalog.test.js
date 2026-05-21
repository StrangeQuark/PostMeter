const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createTutorials } = require('../../src/renderer/features/tutorialCatalog');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DYNAMIC_TUTORIAL_IDS = new Set([
  'cookieManagerCookieTextInput'
]);

test('workspace tutorial covers encrypted workspace workflow', () => {
  const workspaceTutorial = createTutorials({}).find((tutorial) => tutorial.id === 'workspaces-basics');
  assert.ok(workspaceTutorial, 'Expected the Workspaces tutorial to exist.');
  assert.equal(workspaceTutorial.duration, '4 minutes');
  assert.match(workspaceTutorial.summary, /encrypt/);

  const stepsByTitle = new Map(workspaceTutorial.steps.map((step) => [step.title, step]));
  assert.match(stepsByTitle.get('Read the summary')?.body || '', /encryption status/);
  assert.equal(stepsByTitle.has('Check encryption status'), false);
  assert.equal(stepsByTitle.has('Unlock encrypted workspaces'), false);
  assert.equal(stepsByTitle.has('Decrypt when needed'), false);
  assert.equal(
    stepsByTitle.get('Protect sensitive workspaces')?.selector,
    '#encryptWorkspacePanelButton:not([hidden]), #removeWorkspaceEncryptionPanelButton:not([hidden])'
  );
  assert.match(stepsByTitle.get('Protect sensitive workspaces')?.body || '', /Encrypt Workspace saves plaintext workspaces encrypted at rest/);
  assert.match(stepsByTitle.get('Protect sensitive workspaces')?.body || '', /removes old unencrypted backups/);
  assert.match(stepsByTitle.get('Protect sensitive workspaces')?.body || '', /Decrypt Workspace appears for encrypted workspaces/);
  assert.match(stepsByTitle.get('Protect sensitive workspaces')?.body || '', /clickable after the workspace is unlocked/);
  assert.match(stepsByTitle.get('Export workspace definitions')?.body || '', /Encrypted workspaces export as encrypted files/);
  assert.deepEqual(workspaceTutorial.steps.map((step) => step.title), [
    'Open Workspaces',
    'Select a workspace',
    'Review workspace identity',
    'Read the summary',
    'Switch deliberately',
    'Protect sensitive workspaces',
    'Export workspace definitions',
    'Delete workspace'
  ]);
});

test('tutorial catalog has unique IDs and selectors that resolve to renderer targets', () => {
  const rendererHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  const rendererIds = new Set([...rendererHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const tutorials = createTutorials(new Proxy({}, { get: () => () => {} }));
  const tutorialIds = new Set();

  for (const tutorial of tutorials) {
    assert.equal(tutorialIds.has(tutorial.id), false, `Duplicate tutorial id ${tutorial.id}`);
    tutorialIds.add(tutorial.id);
    assert.ok(tutorial.title, `${tutorial.id} needs a title`);
    assert.ok(tutorial.summary, `${tutorial.id} needs a summary`);
    assert.ok(tutorial.duration, `${tutorial.id} needs a duration`);
    assert.ok(tutorial.level, `${tutorial.id} needs a level`);
    assert.ok(Array.isArray(tutorial.steps) && tutorial.steps.length > 0, `${tutorial.id} needs steps`);

    for (const step of tutorial.steps) {
      assert.ok(step.selector, `${tutorial.id} step "${step.title}" needs a selector`);
      assert.ok(step.title, `${tutorial.id} has an untitled step`);
      assert.ok(step.body, `${tutorial.id} step "${step.title}" needs body text`);
      const ids = [...String(step.selector).matchAll(/#([A-Za-z][\w-]*)/g)].map((match) => match[1]);
      for (const id of ids) {
        if (DYNAMIC_TUTORIAL_IDS.has(id)) {
          assert.equal(typeof step.beforeStep, 'function', `Dynamic selector #${id} needs setup`);
          continue;
        }
        assert.ok(rendererIds.has(id), `${tutorial.id} step "${step.title}" references missing #${id}`);
      }
      if (!ids.length) {
        const className = String(step.selector).match(/\.([A-Za-z][\w-]*)/)?.[1];
        const isStaticClass = className && rendererHtml.includes(className);
        assert.ok(
          isStaticClass || typeof step.beforeStep === 'function',
          `${tutorial.id} step "${step.title}" selector should match static markup or provide setup`
        );
      }
    }
  }
});
