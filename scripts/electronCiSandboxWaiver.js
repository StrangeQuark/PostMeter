const WAIVER_ENV = 'POSTMETER_CI_ELECTRON_NO_SANDBOX';

function shouldUseCiNoSandbox(env = process.env, platform = process.platform) {
  return platform === 'linux' && env[WAIVER_ENV] === '1';
}

function withCiNoSandboxArgs(args, env = process.env, platform = process.platform) {
  if (!shouldUseCiNoSandbox(env, platform)) {
    return args;
  }
  return ['--no-sandbox', ...args];
}

module.exports = {
  WAIVER_ENV,
  shouldUseCiNoSandbox,
  withCiNoSandboxArgs
};
