const path = require('node:path');
const { withCiNoSandboxArgs } = require('../../scripts/electronCiSandboxWaiver');
const {
  isRetryableElectronSmokeFailure,
  sanitizeElectronSmokeEnv,
  spawnWithRetries,
  withWindowsElectronGpuWorkaroundArgs
} = require('../../scripts/smokeProcess');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function sourceElectronSmokeEnv(env = process.env, platform = process.platform) {
  return sanitizeElectronSmokeEnv(env, platform);
}

function sourceElectronSmokeArgs(args = [], env = process.env, platform = process.platform) {
  return withCiNoSandboxArgs(withWindowsElectronGpuWorkaroundArgs(args, platform), env, platform);
}

function sourceElectronSmokeAttempts(platform = process.platform) {
  return platform === 'win32' ? 3 : 1;
}

async function runSourceElectronSmoke(electronPath, args = [], options = {}) {
  const platform = options.platform || process.platform;
  const env = sourceElectronSmokeEnv(options.env || process.env, platform);
  return spawnWithRetries(electronPath, sourceElectronSmokeArgs(args, env, platform), {
    ...options,
    cwd: options.cwd || PROJECT_ROOT,
    env,
    maxAttempts: options.maxAttempts || sourceElectronSmokeAttempts(platform),
    retryWhen: options.retryWhen || ((result) => isRetryableElectronSmokeFailure(result, platform))
  });
}

module.exports = {
  runSourceElectronSmoke,
  sourceElectronSmokeArgs,
  sourceElectronSmokeAttempts,
  sourceElectronSmokeEnv
};
