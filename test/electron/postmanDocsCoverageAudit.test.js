const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildDocsCoverageAuditFromSources,
  extractDocsTokens,
  resolveDocsCoverage,
  validateCommittedDocsCoverageAudit,
  validateDocsCoverageAudit
} = require('../../src/core/postmanDocsCoverageAudit');

test('validates the committed official Postman docs coverage audit', async () => {
  const result = await validateCommittedDocsCoverageAudit();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.summary.sourceCount >= 40);
  assert.ok(result.summary.tokenCount >= 150);
  assert.deepEqual(result.summary.unmatched, []);
});

test('extracts representative Postman script tokens from official-doc-style markdown', () => {
  const tokens = extractDocsTokens({
    content: [
      '`pm.response.to.have.responseTime.not.above(200);`',
      "`const pkg = pm.require('npm:@scope/package@1.2.3');`",
      '`pm.environment.name`',
      '`postman.setNextRequest("Next")`'
    ].join('\n'),
    id: 'source:sample',
    kind: 'postman-learning-doc',
    title: 'Sample',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/sample'
  }).map((item) => item.token);

  assert.ok(tokens.includes('pm.response.to.have.responseTime.not.above'));
  assert.ok(tokens.includes("pm.require('npm:@scope/package@1.2.3')"));
  assert.ok(tokens.includes('pm.environment.name'));
  assert.ok(tokens.includes('postman.setNextRequest'));
});

test('maps representative docs tokens to explicit parity rows', () => {
  assert.deepEqual(resolveDocsCoverage('pm.environment.name').rowIds, ['variables.pm.environment.name']);
  assert.deepEqual(resolveDocsCoverage('pm.response.to.have.responseTime.not.above').rowIds, ['assertion.pm.response.to.have.responseTime.not.above']);
  assert.deepEqual(resolveDocsCoverage("pm.require('npm:@scope/package@1.2.3')").rowIds, ['require.pm.npm-scoped-package']);
  assert.ok(resolveDocsCoverage('sdk.HeaderList.upsert').rowIds.includes('sdk.list.upsert'));
});

test('fails closed when an official-docs token is not mapped', () => {
  const audit = buildDocsCoverageAuditFromSources([
    {
      content: '`pm.futureUndocumentedSurface.runEverything()`',
      id: 'source:future',
      kind: 'postman-learning-doc',
      title: 'Future Surface',
      url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/future'
    }
  ]);
  const result = validateDocsCoverageAudit({
    ...audit,
    sources: Array.from({ length: 40 }, (_item, index) => ({
      id: index === 0 ? 'source:future' : `source:padding-${index}`,
      kind: 'postman-learning-doc',
      title: `Padding ${index}`,
      tokenCount: index === 0 ? 1 : 0,
      url: `https://learning.postman.com/docs/tests-and-scripts/write-scripts/padding-${index}`
    })),
    tokens: [
      ...audit.tokens,
      ...Array.from({ length: 150 }, (_item, index) => ({
        coverage: { type: 'excluded', rowIds: [], reason: 'test padding token' },
        id: `padding-${index}`,
        kind: 'pm-api',
        sourceRefs: ['source:future'],
        token: `padding.${index}`
      }))
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('pm.futureUndocumentedSurface.runEverything')));
});
