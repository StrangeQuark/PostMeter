const assert = require('node:assert/strict');
const test = require('node:test');
const { runStartupSmokeProbe } = require('../../electron/mainWindow');

test('startup smoke probe prevents renderer shutdown from overwriting marker save', async () => {
  let executedScript = '';
  const mainWindow = {
    webContents: {
      executeJavaScript: async (script) => {
        executedScript = script;
        return true;
      }
    }
  };

  await runStartupSmokeProbe({ quit() {} }, mainWindow, {
    POSTMETER_PACKAGED_SMOKE_MARKER: 'marker',
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: ''
  });

  assert.match(executedScript, /window\.__postmeterSkipWorkspaceShutdownSave = true/);
  assert.match(executedScript, /window\.postmeter\.workspace\.save\(loaded\.workspace\)/);
});
