const { spawnSync } = require('node:child_process');
const electronPath = require('electron');

const env = { ...process.env };
env.ELECTRON_RUN_AS_NODE = '1';
delete env.NODE_OPTIONS;

const result = spawnSync(electronPath, ['-p', 'process.versions.electron'], {
  env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message || String(result.error));
  process.exit(1);
}

process.exit(result.status ?? 1);
