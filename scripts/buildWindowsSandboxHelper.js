#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SOURCE = path.join(PROJECT_ROOT, 'native', 'windows-sandbox-helper', 'PostMeterWindowsSandboxHelper.cpp');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'native', 'windows-sandbox-helper', 'bin');
const OUTPUT = path.join(OUTPUT_DIR, 'PostMeterWindowsSandboxHelper.exe');
const IF_SUPPORTED = process.argv.includes('--if-supported');

if (process.platform !== 'win32') {
  process.exit(0);
}

try {
  build();
} catch (error) {
  if (IF_SUPPORTED && isMissingCompilerError(error)) {
    console.warn(`Skipping Windows sandbox helper build: ${error.message || String(error)}`);
    process.exit(0);
  }
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}

function build() {
  if (isOutputFresh()) {
    console.log(`Windows sandbox helper is current: ${path.relative(PROJECT_ROOT, OUTPUT)}`);
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const vcvarsPath = findVcvars64();
  const command = [
    `"${vcvarsPath}"`,
    '>',
    'nul',
    '&&',
    'cl',
    '/nologo',
    '/EHsc',
    '/std:c++17',
    '/O2',
    '/DUNICODE',
    '/D_UNICODE',
    `"${SOURCE}"`,
    '/link',
    '/nologo',
    'Advapi32.lib',
    'Userenv.lib',
    `/OUT:"${OUTPUT}"`
  ].join(' ');

  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`Windows sandbox helper build failed.\n${result.stdout || ''}${result.stderr || ''}`);
  }
  const validation = spawnSync(OUTPUT, ['--validate-helper'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (validation.status !== 0) {
    throw new Error(`Windows sandbox helper self-check failed.\n${validation.stdout || ''}${validation.stderr || ''}`);
  }
  console.log(`Built Windows sandbox helper: ${path.relative(PROJECT_ROOT, OUTPUT)}`);
}

function isOutputFresh() {
  try {
    return fs.statSync(OUTPUT).mtimeMs >= fs.statSync(SOURCE).mtimeMs;
  } catch {
    return false;
  }
}

function findVcvars64() {
  const explicit = process.env.POSTMETER_VCVARS64;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) {
    throw new Error('vswhere.exe was not found; install Visual Studio Build Tools with the MSVC x64 toolchain.');
  }
  const result = spawnSync(vswhere, [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath'
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`vswhere.exe failed.\n${result.stdout || ''}${result.stderr || ''}`);
  }
  const installPath = String(result.stdout || '').trim().split(/\r?\n/).find(Boolean);
  if (!installPath) {
    throw new Error('No Visual Studio MSVC x64 toolchain installation was found.');
  }
  const vcvarsPath = path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
  if (!fs.existsSync(vcvarsPath)) {
    throw new Error(`vcvars64.bat was not found at ${vcvarsPath}.`);
  }
  return vcvarsPath;
}

function isMissingCompilerError(error) {
  return /vswhere|Visual Studio|MSVC|vcvars64/i.test(error.message || String(error));
}
