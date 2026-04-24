const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { splitCommandLine } = require('../../src/core/curlFormats');
const { WorkspaceStore } = require('../../src/core/workspaceStore');

test('imports and exports OpenAPI collections', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'openapi.json');
  await fs.writeFile(importPath, JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Inventory API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.test/v1' }],
    components: {
      securitySchemes: {
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        bearerAuth: { type: 'http', scheme: 'bearer' }
      }
    },
    security: [{ apiKeyAuth: [] }],
    paths: {
      '/widgets/{id}': {
        parameters: [{ name: 'trace', in: 'header', example: 'yes' }],
        get: {
          operationId: 'getWidget',
          tags: ['Widgets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'expand', in: 'query', example: 'owner' }],
          responses: {
            200: {
              description: 'Widget response',
              headers: {
                'X-Trace': {
                  schema: { type: 'string' },
                  example: 'trace-1'
                }
              },
              content: {
                'application/json': {
                  examples: {
                    found: {
                      summary: 'Found widget',
                      value: { id: 'w1', name: 'hammer' }
                    }
                  }
                }
              }
            },
            404: {
              description: 'Not found'
            }
          }
        },
        post: {
          summary: 'Create Widget',
          requestBody: {
            content: {
              'application/json': {
                example: { name: 'hammer' }
              }
            }
          }
        }
      }
    }
  }));

  const collection = await store.importCollection(importPath);
  assert.equal(collection.name, 'Inventory API');
  assert.equal(collection.folders[0].name, 'Widgets');
  assert.equal(collection.folders[0].requests[0].url, 'https://api.example.test/v1/widgets/{{id}}');
  assert.equal(collection.folders[0].requests[0].queryParams[0].key, 'expand');
  assert.equal(collection.folders[0].requests[0].auth.type, 'bearer');
  assert.equal(collection.folders[0].requests[0].examples[0].name, '200 application/json Found widget');
  assert.equal(collection.folders[0].requests[0].examples[0].statusCode, 200);
  assert.equal(collection.folders[0].requests[0].examples[0].headers[0].key, 'X-Trace');
  assert.match(collection.folders[0].requests[0].examples[0].body, /"id": "w1"/);
  assert.equal(collection.folders[0].requests[0].assertions.find((assertion) => assertion.type === 'statusCode' && assertion.expected === '200').enabled, false);
  assert.equal(collection.folders[0].requests[0].assertions.find((assertion) => assertion.type === 'header').expected, 'trace-1');
  assert.equal(collection.requests[0].bodyType, 'RAW_JSON');
  assert.equal(collection.requests[0].auth.type, 'apiKey');

  const exportPath = path.join(dir, 'export.openapi.json');
  await store.exportCollection(collection, exportPath, { format: 'openapi' });
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(exported.openapi, '3.1.0');
  const exportedPath = exported.paths['/v1/widgets/{id}'] || exported.paths['/widgets/{id}'];
  assert.ok(exportedPath);
  assert.equal(exported.components.securitySchemes.bearerAuth.type, 'http');
  assert.equal(exported.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.deepEqual(exportedPath.get.security, [{ bearerAuth: [] }]);
  const exportedApiKeyScheme = Object.values(exported.components.securitySchemes)
    .find((scheme) => scheme.type === 'apiKey' && scheme.name === 'X-API-Key');
  assert.equal(exportedApiKeyScheme.in, 'header');
});

test('imports and exports HAR collections', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'collection.har');
  await fs.writeFile(importPath, JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'fixture', version: '1' },
      entries: [{
        request: {
          method: 'POST',
          url: 'https://api.example.test/widgets?trace=1',
          headers: [{ name: 'Accept', value: 'application/json' }],
          queryString: [{ name: 'trace', value: '1' }],
          postData: { mimeType: 'application/json', text: '{"name":"hammer"}' }
        },
        response: {
          status: 201,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          content: { mimeType: 'application/json', text: '{"id":"w1"}' }
        },
        time: 123
      }]
    }
  }));

  const collection = await store.importCollection(importPath);
  assert.equal(collection.requests[0].method, 'POST');
  assert.equal(collection.requests[0].queryParams[0].key, 'trace');
  assert.equal(collection.requests[0].bodyType, 'RAW_JSON');
  assert.equal(collection.requests[0].examples[0].statusCode, 201);
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.responseTimeMillis').value, '123');

  const exportPath = path.join(dir, 'export.har');
  await store.exportCollection(collection, exportPath, { format: 'har' });
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(exported.log.version, '1.2');
  assert.equal(exported.log.entries[0].request.method, 'POST');
});

test('imports and exports curl collections', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'request.sh');
  await fs.writeFile(importPath, "curl -X PATCH 'https://api.example.test/widgets/1?trace=1' -H 'Content-Type: application/json' -b 'session=abc' --proxy 'http://proxy.example.test:8080' --retry 3 --cacert '/tmp/ca.pem' --data-raw '{\"ok\":true}'");

  const collection = await store.importCollection(importPath);
  assert.equal(collection.requests[0].method, 'PATCH');
  assert.equal(collection.requests[0].queryParams[0].key, 'trace');
  assert.equal(collection.requests[0].bodyType, 'RAW_JSON');
  assert.equal(collection.requests[0].headers.find((header) => header.key === 'Cookie').value, 'session=abc');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'curl.proxy').value, 'http://proxy.example.test:8080');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'curl.retry').value, '3');

  const exportPath = path.join(dir, 'export.sh');
  await store.exportCollection(collection, exportPath, { format: 'curl' });
  const exported = await fs.readFile(exportPath, 'utf8');
  assert.match(exported, /^curl /);
  assert.match(exported, /--data-raw/);
});

test('preserves PostMeter device-code OAuth metadata across OpenAPI export and import', async () => {
  const { store, dir } = await tempStore();
  const exportPath = path.join(dir, 'device-code.openapi.json');
  const collection = {
    id: 'collection-1',
    name: 'OAuth Device Collection',
    description: '',
    variables: [],
    certificates: [],
    requests: [{
      id: 'request-1',
      name: 'Device Request',
      method: 'GET',
      url: 'https://api.example.test/me',
      queryParams: [],
      headers: [],
      bodyType: 'NONE',
      body: '',
      auth: {
        type: 'oauth2',
        grantType: 'deviceCode',
        tokenType: 'Bearer',
        accessToken: '',
        deviceAuthorizationUrl: 'https://auth.example.test/device',
        tokenUrl: 'https://auth.example.test/token',
        scopes: 'read'
      },
      assertions: [],
      scripts: { preRequest: '', tests: '' },
      variables: [],
      examples: [],
      cookieJar: { enabled: false, storeResponses: true },
      loadTestPolicy: { enabled: false }
    }],
    folders: []
  };

  await store.exportCollection(collection, exportPath, { format: 'openapi' });
  const imported = await store.importCollection(exportPath);

  assert.equal(imported.requests[0].auth.type, 'oauth2');
  assert.equal(imported.requests[0].auth.grantType, 'deviceCode');
  assert.equal(imported.requests[0].auth.authorizationUrl, '');
  assert.equal(imported.requests[0].auth.deviceAuthorizationUrl, 'https://auth.example.test/device');
  assert.equal(imported.requests[0].auth.tokenUrl, 'https://auth.example.test/token');
});

test('imports curl commands with attached short-option values and preserves trailing escaped backslashes', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'attached-request.sh');
  await fs.writeFile(importPath, 'curl -dfoo=bar https://api.example.test/items');

  const collection = await store.importCollection(importPath);

  assert.equal(collection.requests[0].method, 'POST');
  assert.equal(collection.requests[0].body, 'foo=bar');
  assert.equal(collection.requests[0].bodyType, 'RAW_TEXT');
  assert.deepEqual(splitCommandLine('curl http://example.com/foo\\\\'), ['curl', 'http://example.com/foo\\']);
});

test('imports and exports JMeter plans', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'plan.jmx');
  await fs.writeFile(importPath, `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan>
  <ThreadGroup testname="Threads">
    <stringProp name="ThreadGroup.num_threads">4</stringProp>
    <stringProp name="ThreadGroup.ramp_time">8</stringProp>
  </ThreadGroup>
  <Arguments testname="User Defined Variables">
    <collectionProp name="Arguments.arguments">
      <elementProp name="baseUrl" elementType="HTTPArgument">
        <stringProp name="Argument.name">baseUrl</stringProp>
        <stringProp name="Argument.value">https://api.example.test</stringProp>
      </elementProp>
    </collectionProp>
  </Arguments>
  <CSVDataSet testname="Users">
    <stringProp name="filename">users.csv</stringProp>
    <stringProp name="variableNames">username,password</stringProp>
  </CSVDataSet>
  <ConstantTimer testname="Think Time">
    <stringProp name="ConstantTimer.delay">250</stringProp>
  </ConstantTimer>
  <ConstantThroughputTimer testname="Target Throughput">
    <stringProp name="throughput">120</stringProp>
    <stringProp name="calcMode">1</stringProp>
  </ConstantThroughputTimer>
  <UniformRandomTimer testname="Random Pause">
    <stringProp name="RandomTimer.range">500</stringProp>
    <stringProp name="ConstantTimer.delay">100</stringProp>
  </UniformRandomTimer>
  <GaussianRandomTimer testname="Gaussian Pause">
    <stringProp name="GaussianRandomTimer.range">750</stringProp>
    <stringProp name="ConstantTimer.delay">125</stringProp>
  </GaussianRandomTimer>
  <ResultCollector testname="Summary Report">
    <stringProp name="filename">results.jtl</stringProp>
  </ResultCollector>
  <LoopController testname="Retry Loop">
    <stringProp name="LoopController.loops">2</stringProp>
  </LoopController>
  <TransactionController testname="Account Transaction">
    <stringProp name="TransactionController.parent">true</stringProp>
  </TransactionController>
  <ThroughputController testname="Half Traffic">
    <stringProp name="ThroughputController.style">1</stringProp>
    <stringProp name="ThroughputController.percentThroughput">50.0</stringProp>
  </ThroughputController>
  <RuntimeController testname="Short Run">
    <stringProp name="RuntimeController.seconds">30</stringProp>
  </RuntimeController>
  <HTTPSamplerProxy testname="List Widgets">
    <stringProp name="HTTPSampler.domain">api.example.test</stringProp>
    <stringProp name="HTTPSampler.protocol">https</stringProp>
    <stringProp name="HTTPSampler.path">/widgets</stringProp>
    <stringProp name="HTTPSampler.method">GET</stringProp>
    <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
      <collectionProp name="Arguments.arguments">
        <elementProp name="limit" elementType="HTTPArgument">
          <stringProp name="Argument.name">limit</stringProp>
          <stringProp name="Argument.value">10</stringProp>
        </elementProp>
      </collectionProp>
    </elementProp>
  </HTTPSamplerProxy>
  <hashTree>
    <HeaderManager testname="Headers">
      <collectionProp name="HeaderManager.headers">
        <elementProp name="X-Trace" elementType="Header">
          <stringProp name="Header.name">X-Trace</stringProp>
          <stringProp name="Header.value">from-jmeter</stringProp>
        </elementProp>
      </collectionProp>
    </HeaderManager>
    <ResponseAssertion testname="Status 200">
      <collectionProp name="Asserion.test_strings">
        <stringProp name="200">200</stringProp>
      </collectionProp>
      <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
    </ResponseAssertion>
    <ResponseAssertion testname="Disabled Body Match" enabled="false">
      <collectionProp name="Assertion.test_strings">
        <stringProp name="ready">ready</stringProp>
      </collectionProp>
      <stringProp name="Assertion.test_field">Assertion.response_data</stringProp>
    </ResponseAssertion>
    <DurationAssertion testname="Under 1s">
      <stringProp name="DurationAssertion.duration">1000</stringProp>
    </DurationAssertion>
    <SizeAssertion testname="Small Body">
      <stringProp name="SizeAssertion.size">4096</stringProp>
      <stringProp name="SizeAssertion.operator">4</stringProp>
    </SizeAssertion>
    <JSONPathAssertion testname="Has data">
      <stringProp name="JSON_PATH">$.data.id</stringProp>
      <stringProp name="EXPECTED_VALUE">w1</stringProp>
    </JSONPathAssertion>
    <JSONPathAssertion testname="Disabled JSON" enabled="false">
      <stringProp name="JSON_PATH">$.disabled</stringProp>
      <stringProp name="EXPECTED_VALUE">true</stringProp>
    </JSONPathAssertion>
    <XPathAssertion testname="Has XML title">
      <stringProp name="XPath.xpath">/response/title</stringProp>
    </XPathAssertion>
    <JSONPostProcessor testname="Extract JSON Token">
      <stringProp name="JSONPostProcessor.referenceNames">jsonToken</stringProp>
      <stringProp name="JSONPostProcessor.jsonPathExprs">$.token</stringProp>
      <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
      <stringProp name="JSONPostProcessor.defaultValues"></stringProp>
    </JSONPostProcessor>
    <RegexExtractor testname="Extract Regex Token">
      <stringProp name="RegexExtractor.refname">regexToken</stringProp>
      <stringProp name="RegexExtractor.regex">"token":"([^"]+)"</stringProp>
      <stringProp name="RegexExtractor.template">$1$</stringProp>
    </RegexExtractor>
    <MD5HexAssertion testname="Legacy MD5">
      <stringProp name="MD5HexAssertion.size">32</stringProp>
    </MD5HexAssertion>
  </hashTree>
</jmeterTestPlan>`);

  const collection = await store.importCollection(importPath);
  assert.equal(collection.requests[0].name, 'List Widgets');
  assert.equal(collection.requests[0].url, 'https://api.example.test/widgets');
  assert.equal(collection.requests[0].queryParams[0].value, '10');
  assert.equal(collection.variables.find((variable) => variable.key === 'baseUrl').value, 'https://api.example.test');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.csv.Users.filename').value, 'users.csv');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.threadGroup.threads').value, '4');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.constantDelayMillis').value, '250');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Think Time.constantDelayMillis').value, '250');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Target Throughput.throughput').value, '120');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Target Throughput.calcMode').value, '1');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Random Pause.RandomTimer.range').value, '500');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Gaussian Pause.GaussianRandomTimer.range').value, '750');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Retry Loop.class').value, 'LoopController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Account Transaction.class').value, 'TransactionController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Half Traffic.class').value, 'ThroughputController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Half Traffic.percentThroughput').value, '50.0');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Short Run.class').value, 'RuntimeController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Short Run.seconds').value, '30');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.listener.Summary Report.filename').value, 'results.jtl');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.Legacy MD5.class').value, 'MD5HexAssertion');
  assert.equal(collection.requests[0].headers.find((header) => header.key === 'X-Trace').value, 'from-jmeter');
  assert.equal(collection.requests[0].assertions[0].type, 'statusCode');
  assert.equal(collection.requests[0].assertions[0].expected, '200');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'responseTime').expected, '1000');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.name === 'Disabled Body Match').enabled, false);
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'responseSize').expected, '4096');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'jsonPath').path, '$.data.id');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.name === 'Disabled JSON').enabled, false);
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'xmlPath').path, '/response/title');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'extractVariable').variableName, 'jsonToken');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'extractRegex').variableName, 'regexToken');
  collection.requests[0].assertions.push({
    enabled: true,
    type: 'bodyContains',
    name: 'Body includes ok',
    path: '',
    operator: 'contains',
    expected: 'ok',
    variableName: ''
  });
  collection.requests[0].assertions.push({
    enabled: true,
    type: 'responseTime',
    name: 'Fast enough',
    path: '',
    operator: 'lessThan',
    expected: '750',
    variableName: ''
  });

  const exportPath = path.join(dir, 'export.jmx');
  await store.exportCollection(collection, exportPath, { format: 'jmeter' });
  const exported = await fs.readFile(exportPath, 'utf8');
  assert.match(exported, /<jmeterTestPlan/);
  assert.match(exported, /HTTPSamplerProxy/);
  assert.match(exported, /HeaderManager/);
  assert.match(exported, /X-Trace/);
  assert.match(exported, /User Defined Variables/);
  assert.match(exported, /ConstantTimer/);
  assert.match(exported, /ConstantThroughputTimer/);
  assert.match(exported, /UniformRandomTimer/);
  assert.match(exported, /GaussianRandomTimer/);
  assert.match(exported, /TransactionController/);
  assert.match(exported, /ThroughputController/);
  assert.match(exported, /RuntimeController/);
  assert.match(exported, /ResponseAssertion/);
  assert.match(exported, /DurationAssertion/);
  assert.match(exported, /SizeAssertion/);
  assert.match(exported, /JSONPathAssertion/);
  assert.match(exported, /XPathAssertion/);
  assert.match(exported, /JSONPostProcessor/);
  assert.match(exported, /RegexExtractor/);
  assert.match(exported, /MD5HexAssertion/);
});

test('imports realistic JMeter fixtures while preserving unsupported metadata', async () => {
  const { store, dir } = await tempStore();
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'jmeter', 'http-plan.jmx');
  const importPath = path.join(dir, 'realistic-plan.jmx');
  await fs.copyFile(fixturePath, importPath);

  const collection = await store.importCollection(importPath);
  assert.equal(collection.requests[0].name, 'Get Account');
  assert.equal(collection.requests[0].url, 'https://api.example.test/v1/account');
  assert.equal(collection.requests[0].queryParams.find((param) => param.key === 'expand').value, 'profile');
  assert.equal(collection.requests[0].headers.find((header) => header.key === 'Accept').value, 'application/json');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'responseTime').expected, '500');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'jsonPath').path, '$.account.id');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'extractRegex').variableName, 'legacyToken');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.threadGroup.threads').value, '6');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.csv.Users.filename').value, 'users.csv');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.listener.Summary Report.filename').value, 'results.jtl');
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'xmlPath').enabled, false);
  assert.equal(collection.requests[0].assertions.find((assertion) => assertion.type === 'xmlPath').path, '/response/title');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.Legacy post script.scriptLanguage').value, 'groovy');

  const exportPath = path.join(dir, 'export.jmx');
  await store.exportCollection(collection, exportPath, { format: 'jmeter' });
  const exported = await fs.readFile(exportPath, 'utf8');
  assert.doesNotMatch(exported, /jmeter\.unsupported\./);
  assert.match(exported, /<JSR223PostProcessor/);
  assert.match(exported, /scriptLanguage/);
});

test('imports nested JMeter controller plans with XPath assertion variants', async () => {
  const { store, dir } = await tempStore();
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'jmeter', 'nested-xpath-plan.jmx');
  const importPath = path.join(dir, 'nested-xpath-plan.jmx');
  await fs.copyFile(fixturePath, importPath);

  const collection = await store.importCollection(importPath);

  assert.equal(collection.requests.length, 2);
  assert.deepEqual(collection.requests.map((request) => request.name), ['Get XML Account', 'Get XML Orders']);
  assert.equal(collection.requests[0].url, 'https://xml.example.test/v2/account');
  assert.equal(collection.requests[1].url, 'https://xml.example.test/v2/orders');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Outer Loop.class').value, 'LoopController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Outer Loop.loops').value, '4');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Only XML.class').value, 'IfController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Only XML.condition').value, '${runXml}');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Twenty Percent.class').value, 'ThroughputController');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.controller.Twenty Percent.percentThroughput').value, '20.0');

  const accountAssertions = collection.requests[0].assertions.filter((assertion) => assertion.type === 'xmlPath');
  assert.equal(accountAssertions.length, 2);
  assert.deepEqual(accountAssertions.map((assertion) => assertion.path), ['exists(/account/id)', '/account/name']);
  assert.ok(accountAssertions.every((assertion) => assertion.enabled === true));

  const ordersXmlAssertion = collection.requests[1].assertions.find((assertion) => assertion.type === 'xmlPath');
  assert.equal(ordersXmlAssertion.path, 'exists(/orders/order)');
  assert.equal(ordersXmlAssertion.enabled, false);

  const exportPath = path.join(dir, 'nested-export.jmx');
  await store.exportCollection(collection, exportPath, { format: 'jmeter' });
  const exported = await fs.readFile(exportPath, 'utf8');
  assert.match(exported, /LoopController/);
  assert.match(exported, /IfController/);
  assert.match(exported, /ThroughputController/);
  assert.match(exported, /XPathAssertion/);
  assert.match(exported, /exists\(\/account\/id\)/);
});

test('imports representative JMeter timer and assertion matrix without claiming unsupported execution parity', async () => {
  const { store, dir } = await tempStore();
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'jmeter', 'timer-assertion-matrix.jmx');
  const importPath = path.join(dir, 'timer-assertion-matrix.jmx');
  await fs.copyFile(fixturePath, importPath);

  const collection = await store.importCollection(importPath);
  const request = collection.requests[0];

  assert.equal(request.name, 'Matrix Request');
  assert.equal(request.url, 'https://matrix.example.test/v1/matrix');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Precise Arrival.class').value, 'PreciseThroughputTimer');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Precise Arrival.throughput').value, '30');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Poisson Pause.class').value, 'PoissonRandomTimer');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.timer.Poisson Pause.RandomTimer.range').value, '250');
  assert.equal(request.assertions.find((assertion) => assertion.name === 'Header Message').enabled, false);
  assert.equal(request.assertions.find((assertion) => assertion.name === 'Header Message').type, 'bodyContains');
  assert.equal(request.assertions.find((assertion) => assertion.name === 'Disabled Duration').enabled, false);
  assert.equal(request.assertions.find((assertion) => assertion.name === 'Disabled Size').operator, 'greaterThan');
  assert.equal(request.assertions.find((assertion) => assertion.name === 'Disabled JSON Path').enabled, false);
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.HTML Validity.class').value, 'HTMLAssertion');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.HTML Validity.enabled').value, 'true');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.Schema Check.class').value, 'XMLSchemaAssertion');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.Compare Previous.enabled').value, 'false');
  assert.equal(collection.variables.find((variable) => variable.key === 'jmeter.unsupported.Signed MIME.class').value, 'SMIMEAssertion');

  const exportPath = path.join(dir, 'timer-assertion-matrix-export.jmx');
  await store.exportCollection(collection, exportPath, { format: 'jmeter' });
  const exported = await fs.readFile(exportPath, 'utf8');
  assert.match(exported, /PreciseThroughputTimer/);
  assert.match(exported, /PoissonRandomTimer/);
  assert.match(exported, /HTMLAssertion/);
  assert.match(exported, /XMLSchemaAssertion/);
  assert.match(exported, /CompareAssertion/);
  assert.match(exported, /SMIMEAssertion/);
  assert.match(exported, /testname="HTML Validity" enabled="false"/);
});

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-formats-'));
  return {
    dir,
    store: new WorkspaceStore(path.join(dir, 'workspace.json'))
  };
}
