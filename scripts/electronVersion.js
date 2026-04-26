const { spawnSync } = require('node:child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electronPath, ['--version'], {
  env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message || String(result.error));
  process.exit(1);
}

process.exit(result.status ?? 1);
