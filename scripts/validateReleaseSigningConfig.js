const REQUIRED_BY_PLATFORM = Object.freeze({
  windows: ['CSC_LINK', 'CSC_KEY_PASSWORD'],
  macos: ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  linux: []
});

function main(argv = process.argv.slice(2), env = process.env) {
  const platform = normalizePlatform(flagValue(argv, '--platform') || env.POSTMETER_RELEASE_PLATFORM || process.platform);
  const releaseMode = String(flagValue(argv, '--mode') || env.POSTMETER_RELEASE_MODE || 'local').trim().toLowerCase();
  validateReleaseSigningConfig({ platform, releaseMode, env });
  console.log(`Release signing configuration valid for ${platform} (${releaseMode}).`);
}

function validateReleaseSigningConfig({ platform, releaseMode = 'local', env = process.env } = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  if (releaseMode !== 'production') {
    return { platform: normalizedPlatform, skipped: true };
  }
  const required = REQUIRED_BY_PLATFORM[normalizedPlatform] || [];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Production ${normalizedPlatform} release signing is missing required secret/env value(s): ${missing.join(', ')}.`);
  }
  return { platform: normalizedPlatform, skipped: false };
}

function normalizePlatform(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'win32' || text === 'windows') {
    return 'windows';
  }
  if (text === 'darwin' || text === 'mac' || text === 'macos') {
    return 'macos';
  }
  if (text === 'linux') {
    return 'linux';
  }
  return text || 'unknown';
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) {
    return '';
  }
  return argv[index + 1] || '';
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  normalizePlatform,
  validateReleaseSigningConfig
};
