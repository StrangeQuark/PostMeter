const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildNodeTestArgs,
  collectTestFiles,
  defaultTestRoot,
  runElectronTests
} = require('../../scripts/runElectronTests');

test('Electron test runner discovers only .test.js files recursively in deterministic order', (t) => {
  const testRoot = makeTempDirectory(t);
  fs.mkdirSync(path.join(testRoot, 'nested'));
  fs.mkdirSync(path.join(testRoot, 'nested', 'deep'));
  fs.writeFileSync(path.join(testRoot, 'root.test.js'), '');
  fs.writeFileSync(path.join(testRoot, 'root.spec.js'), '');
  fs.writeFileSync(path.join(testRoot, 'nested', 'middle.test.js'), '');
  fs.writeFileSync(path.join(testRoot, 'nested', 'ignored.js'), '');
  fs.writeFileSync(path.join(testRoot, 'nested', 'deep', 'last.test.js'), '');

  assert.deepEqual(
    collectTestFiles(testRoot).map((filePath) => path.relative(testRoot, filePath)),
    [
      path.join('nested', 'deep', 'last.test.js'),
      path.join('nested', 'middle.test.js'),
      'root.test.js'
    ]
  );
});

test('Electron test runner builds node --test arguments with configured concurrency', () => {
  assert.deepEqual(
    buildNodeTestArgs(['alpha.test.js', 'beta.test.js'], { POSTMETER_TEST_CONCURRENCY: '3' }),
    ['--test', '--test-concurrency=3', 'alpha.test.js', 'beta.test.js']
  );
  assert.deepEqual(
    buildNodeTestArgs(['alpha.test.js'], {}),
    ['--test', '--test-concurrency=1', 'alpha.test.js']
  );
});

test('Electron test runner forwards discovered files to the configured node executable', (t) => {
  const testRoot = makeTempDirectory(t);
  fs.mkdirSync(path.join(testRoot, 'nested'));
  fs.writeFileSync(path.join(testRoot, 'alpha.test.js'), '');
  fs.writeFileSync(path.join(testRoot, 'nested', 'beta.test.js'), '');
  const spawnCalls = [];

  const status = runElectronTests({
    env: { POSTMETER_TEST_CONCURRENCY: '2' },
    execPath: '/tmp/node-under-test',
    spawn: (execPath, args, options) => {
      spawnCalls.push({ execPath, args, options });
      return { status: 7 };
    },
    stdio: 'pipe',
    testRoot
  });

  assert.equal(status, 7);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].execPath, '/tmp/node-under-test');
  assert.deepEqual(
    spawnCalls[0].args.map((value) => path.isAbsolute(value) ? path.relative(testRoot, value) : value),
    ['--test', '--test-concurrency=2', 'alpha.test.js', path.join('nested', 'beta.test.js')]
  );
  assert.deepEqual(spawnCalls[0].options, { stdio: 'pipe' });
});

test('Electron test runner returns failure when no tests are discovered', (t) => {
  const testRoot = makeTempDirectory(t);
  const errors = [];

  const status = runElectronTests({
    stderr: (message) => errors.push(message),
    testRoot
  });

  assert.equal(status, 1);
  assert.deepEqual(errors, ['No Electron test files found.']);
});

test('Electron test runner reports spawn errors and null child status as failures', (t) => {
  const testRoot = makeTempDirectory(t);
  fs.writeFileSync(path.join(testRoot, 'alpha.test.js'), '');
  const errors = [];

  assert.equal(
    runElectronTests({
      spawn: () => ({ error: new Error('spawn failed') }),
      stderr: (message) => errors.push(message),
      testRoot
    }),
    1
  );
  assert.deepEqual(errors, ['spawn failed']);
  assert.equal(
    runElectronTests({
      spawn: () => ({ status: null }),
      testRoot
    }),
    1
  );
});

test('Electron test runner default root points at test/electron', () => {
  assert.equal(path.relative(path.join(__dirname, '..', '..'), defaultTestRoot()), path.join('test', 'electron'));
});

function makeTempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postmeter-electron-runner-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
