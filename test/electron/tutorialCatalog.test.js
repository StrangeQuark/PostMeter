const assert = require('node:assert/strict');
const test = require('node:test');
const { createTutorials } = require('../../src/renderer/features/tutorialCatalog');

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
