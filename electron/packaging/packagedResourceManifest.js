const fs = require('node:fs');
const path = require('node:path');

const PACKAGED_STARTUP_SMOKE_NODE_PARTS = Object.freeze([
  'electron',
  'packaging',
  'packagedStartupSmokeNode.js'
]);
const PACKAGED_SANDBOX_RUNTIME_CLI_PARTS = Object.freeze([
  'electron',
  'packaging',
  'packagedSandboxRuntimeCli.js'
]);

function packagedAppResourcePath(executable, relativeParts = []) {
  const resourcesPath = path.join(path.dirname(path.resolve(executable)), 'resources');
  const appAsar = path.join(resourcesPath, 'app.asar');
  const appRoot = fs.existsSync(appAsar)
    ? appAsar
    : path.join(resourcesPath, 'app');
  return path.join(appRoot, ...relativeParts);
}

function packagedStartupSmokeNodePath(executable) {
  return packagedAppResourcePath(executable, PACKAGED_STARTUP_SMOKE_NODE_PARTS);
}

function packagedSandboxRuntimeCliPath(executable) {
  return packagedAppResourcePath(executable, PACKAGED_SANDBOX_RUNTIME_CLI_PARTS);
}

module.exports = {
  packagedAppResourcePath,
  packagedSandboxRuntimeCliPath,
  packagedStartupSmokeNodePath,
  PACKAGED_SANDBOX_RUNTIME_CLI_PARTS,
  PACKAGED_STARTUP_SMOKE_NODE_PARTS
};
