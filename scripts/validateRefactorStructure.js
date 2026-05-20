#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  APP_RENDERER_ALLOWED_ASSET_PATHS,
  APP_RENDERER_CORE_ASSET_PATHS
} = require('../electron/app-shell/rendererAssetManifest');
const {
  PACKAGED_SANDBOX_RUNTIME_CLI_PARTS,
  PACKAGED_STARTUP_SMOKE_NODE_PARTS
} = require('../electron/packaging/packagedResourceManifest');

const PROJECT_ROOT = path.join(__dirname, '..');

function main() {
  assertOnlyRootReadme();
  assertRootFiles('src/core', ['index.js']);
  assertRootFiles('src/renderer', ['index.html', 'renderer.js']);
  assertRootFiles('electron', ['main.js']);
  assertDirectories('src/core', [
    'contracts',
    'diagnostics-release',
    'domains',
    'http',
    'import-export',
    'runtime',
    'sandbox',
    'workspace'
  ]);
  assertDirectories('src/renderer', [
    'app',
    'features',
    'formatting',
    'html',
    'models',
    'smoke',
    'styles',
    'ui',
    'vendor'
  ]);
  assertDirectories('electron', [
    'app-shell',
    'domains',
    'ipc',
    'packaging',
    'security',
    'services',
    'workers'
  ]);
  assertRendererSmokeFilesAreGrouped();
  assertFileLineCountAtMost('src/renderer/renderer.js', 1000, 'renderer shell');
  assertManifestFilesExist(APP_RENDERER_ALLOWED_ASSET_PATHS);
  assertManifestFilesExist(APP_RENDERER_CORE_ASSET_PATHS);
  assertManifestFileExists(path.join(...PACKAGED_STARTUP_SMOKE_NODE_PARTS));
  assertManifestFileExists(path.join(...PACKAGED_SANDBOX_RUNTIME_CLI_PARTS));
  console.log('Refactor structure is valid.');
}

function assertRootFiles(relativeDirectory, allowedFiles) {
  const directory = path.join(PROJECT_ROOT, relativeDirectory);
  const allowed = new Set(allowedFiles);
  const unexpected = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !allowed.has(entry.name))
    .map((entry) => path.join(relativeDirectory, entry.name))
    .sort();
  if (unexpected.length) {
    throw new Error(`${relativeDirectory} contains ungrouped files:\n${unexpected.join('\n')}`);
  }
}

function assertOnlyRootReadme() {
  const allowed = path.join(PROJECT_ROOT, 'README.md');
  const unexpected = [];
  collectReadmeFiles(PROJECT_ROOT, unexpected, allowed);
  if (unexpected.length) {
    throw new Error(`Only the root README.md is allowed:\n${unexpected.sort().join('\n')}`);
  }
}

function collectReadmeFiles(directory, unexpected, allowedFile) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'release', 'coverage'].includes(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectReadmeFiles(filePath, unexpected, allowedFile);
    } else if (/^readme(?:\..*)?$/i.test(entry.name) && filePath !== allowedFile) {
      unexpected.push(path.relative(PROJECT_ROOT, filePath));
    }
  }
}

function assertDirectories(relativeDirectory, expectedDirectories) {
  for (const directoryName of expectedDirectories) {
    const directory = path.join(PROJECT_ROOT, relativeDirectory, directoryName);
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Missing expected refactor directory: ${path.join(relativeDirectory, directoryName)}`);
    }
  }
}

function assertRendererSmokeFilesAreGrouped() {
  const rendererRoot = path.join(PROJECT_ROOT, 'src', 'renderer');
  const misplaced = fs.readdirSync(rendererRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^ui[A-Z].*Smoke\.js$/.test(entry.name))
    .map((entry) => path.join('src', 'renderer', entry.name));
  if (misplaced.length) {
    throw new Error(`Renderer smoke harnesses belong in src/renderer/smoke:\n${misplaced.join('\n')}`);
  }
}

function assertFileLineCountAtMost(relativeFile, maximumLines, label) {
  const filePath = path.join(PROJECT_ROOT, relativeFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const lineCount = content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0);
  if (lineCount > maximumLines) {
    throw new Error(`${label} is ${lineCount} lines; keep ${relativeFile} at or below ${maximumLines} lines.`);
  }
}

function assertManifestFilesExist(assetPaths) {
  for (const assetPath of assetPaths) {
    assertManifestFileExists(assetPath.startsWith('/') ? assetPath.slice(1) : assetPath);
  }
}

function assertManifestFileExists(relativeFile) {
  const filePath = path.join(PROJECT_ROOT, relativeFile);
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Manifest path does not point to a tracked file: ${relativeFile}`);
  }
}

main();
