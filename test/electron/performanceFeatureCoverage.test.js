const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

const PERFORMANCE_TYPES = Object.freeze([
  'Latency',
  'RPS / throughput',
  'Concurrency',
  'Stress',
  'Spike',
  'Soak',
  'Ramp'
]);

const REQUIRED_PERFORMANCE_TEST_FILES = Object.freeze([
  'test/electron/performanceModel.test.js',
  'test/electron/performanceFormats.test.js',
  'test/electron/performanceRunner.test.js',
  'test/electron/performanceRendererModel.test.js',
  'test/electron/runtimeIpc.test.js',
  'test/electron/rendererBootstrap.test.js',
  'test/electron/requestTabState.test.js',
  'test/electron/rendererSessionPersistence.test.js',
  'test/electron/productionReadiness.test.js'
]);

test('Performance implementation keeps focused model runtime renderer and release tests in place', async () => {
  for (const testFile of REQUIRED_PERFORMANCE_TEST_FILES) {
    await fs.access(path.join(PROJECT_ROOT, testFile));
  }
});

test('Performance docs keep the seven local V1 types and positive/negative scenarios visible', async () => {
  const techSpecs = await readProjectFile('docs/TECH_SPECS.md');
  const compatibility = await readProjectFile('docs/COMPATIBILITY.md');
  const nextSteps = await readProjectFile('NEXT_STEPS.MD');
  const combined = `${techSpecs}\n${compatibility}\n${nextSteps}`;

  for (const type of PERFORMANCE_TYPES) {
    assert.match(combined, new RegExp(escapeRegExp(type), 'i'), `Missing Performance type ${type}.`);
    assert.match(techSpecs, new RegExp(`\\|\\s*${escapeRegExp(type)}\\s*\\|[^\\n]*positive`, 'i'), `${type} needs a positive scenario in docs/TECH_SPECS.md.`);
    assert.match(techSpecs, new RegExp(`\\|\\s*${escapeRegExp(type)}\\s*\\|[^\\n]*negative`, 'i'), `${type} needs a negative scenario in docs/TECH_SPECS.md.`);
  }

  assert.match(combined, /local first-class saved performance tests/i);
  assert.match(combined, /workspace\.performanceTests/);
  assert.match(combined, /distributed\/cloud load execution remains deferred/i);
  assert.doesNotMatch(combined, /does not currently claim Performance execution support/i);
  assert.doesNotMatch(compatibility, /JMeter import, export, conversion, or execution is supported/i);
});

test('Performance docs track model, UI, import/export, safety, and environment guardrails', async () => {
  const docs = [
    await readProjectFile('README.md'),
    await readProjectFile('docs/TECH_SPECS.md'),
    await readProjectFile('docs/ARCHITECTURE.md'),
    await readProjectFile('docs/COMPATIBILITY.md'),
    await readProjectFile('docs/RELEASE_READINESS.md'),
    await readProjectFile('NEXT_STEPS.MD')
  ].join('\n');
  const requiredPhrases = [
    'request-copy isolation from Collections',
    'Manual request entry',
    'Environment copy-vs-mutate behavior',
    'Import/export validation',
    'Safety cap rejection and cancellation',
    'Empty pane',
    'New dropdown',
    'sidebar placement',
    'dirty tab behavior',
    'save/discard semantics'
  ];

  for (const phrase of requiredPhrases) {
    assert.match(docs, new RegExp(escapeRegExp(phrase), 'i'), `Missing Performance guardrail: ${phrase}.`);
  }
});

async function readProjectFile(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
