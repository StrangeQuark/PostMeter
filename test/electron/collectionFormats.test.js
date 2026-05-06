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

test('imports OpenAPI server variables, path variables, cookies, and binary body hints', async () => {
  const { store, dir } = await tempStore();
  const importPath = path.join(dir, 'openapi-edge.json');
  await fs.writeFile(importPath, JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'OpenAPI Edge Matrix', version: '1.0.0' },
    servers: [{
      url: 'https://{region}.api.example.test/{version}',
      variables: {
        region: { default: 'us' },
        version: { default: 'v2' }
      }
    }],
    components: {
      schemas: {
        ReferencedBinary: { type: 'string', format: 'binary' }
      },
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' }
      }
    },
    paths: {
      '/files/{fileId}': {
        put: {
          operationId: 'uploadFile',
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: 'fileId', in: 'path', schema: { type: 'string', default: 'file-1' } },
            { name: 'session', in: 'cookie', schema: { type: 'string', default: 'cookie-1' } }
          ],
          requestBody: {
            content: {
              'application/octet-stream': {
                schema: { $ref: '#/components/schemas/ReferencedBinary' }
              }
            }
          },
          responses: { 204: { description: 'Uploaded' } }
        }
      }
    }
  }));

  const collection = await store.importCollection(importPath);
  const request = collection.requests[0];
  assert.equal(collection.variables.find((variable) => variable.key === 'region').value, 'us');
  assert.equal(collection.variables.find((variable) => variable.key === 'version').value, 'v2');
  assert.equal(request.url, 'https://{{region}}.api.example.test/{{version}}/files/{{fileId}}');
  assert.equal(request.variables.find((variable) => variable.key === 'fileId').value, 'file-1');
  assert.equal(request.headers.find((header) => header.key === 'Cookie').value, 'session=cookie-1');
  assert.equal(request.auth.type, 'cookie');
  assert.equal(request.auth.value, 'sid={{sid}}');
  assert.equal(request.variables.find((variable) => variable.key === 'openapi.requestBody.binary').value, 'true');
  assert.equal(request.variables.find((variable) => variable.key === 'openapi.requestBody.contentType').value, 'application/octet-stream');

  const exportPath = path.join(dir, 'openapi-edge-export.json');
  await store.exportCollection(collection, exportPath, { format: 'openapi' });
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  const exportedParameters = exported.paths['/{version}/files/{fileId}'].put.parameters;
  const exportedPathParameter = exportedParameters
    .find((parameter) => parameter.in === 'path' && parameter.name === 'fileId');
  assert.equal(exportedPathParameter.required, true);
  assert.equal(exportedPathParameter.example, 'file-1');
  const exportedParameter = exportedParameters
    .find((parameter) => parameter.in === 'cookie' && parameter.name === 'session');
  assert.equal(exportedParameter.example, 'cookie-1');
});

test('imports OpenAPI local references and Swagger 2 request body variants', async () => {
  const { store, dir } = await tempStore();
  const refPath = path.join(dir, 'openapi-ref.json');
  await fs.writeFile(refPath, JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Referenced API', version: '1.0.0' },
    servers: [{ url: 'https://ref.example.test' }],
    components: {
      parameters: {
        id: { name: 'id', in: 'path', schema: { type: 'string', default: 'ref-1' } },
        trace: { name: 'X-Trace', in: 'header', example: 'trace-ref' }
      },
      requestBodies: {
        widget: {
          content: {
            'application/json': {
              example: { name: 'referenced' }
            }
          }
        }
      },
      responses: {
        created: {
          description: 'Created',
          headers: {
            Location: { schema: { type: 'string', default: '/widgets/ref-1' } }
          },
          content: {
            'application/json': {
              examples: {
                created: { value: { id: 'ref-1' } }
              }
            }
          }
        }
      }
    },
    paths: {
      '/widgets/{id}': {
        post: {
          operationId: 'createReferencedWidget',
          parameters: [
            { $ref: '#/components/parameters/id' },
            { $ref: '#/components/parameters/trace' }
          ],
          requestBody: { $ref: '#/components/requestBodies/widget' },
          responses: {
            201: { $ref: '#/components/responses/created' }
          }
        }
      }
    }
  }));

  const referenced = await store.importCollection(refPath);
  const referencedRequest = referenced.requests[0];
  assert.equal(referencedRequest.url, 'https://ref.example.test/widgets/{{id}}');
  assert.equal(referencedRequest.variables.find((variable) => variable.key === 'id').value, 'ref-1');
  assert.equal(referencedRequest.headers.find((header) => header.key === 'X-Trace').value, 'trace-ref');
  assert.match(referencedRequest.body, /referenced/);
  assert.equal(referencedRequest.examples[0].statusCode, 201);
  assert.equal(referencedRequest.examples[0].headers.find((header) => header.key === 'Location').value, '/widgets/ref-1');

  const swaggerBodyPath = path.join(dir, 'swagger-body.json');
  await fs.writeFile(swaggerBodyPath, JSON.stringify({
    swagger: '2.0',
    info: { title: 'Swagger Body API', version: '1.0.0' },
    schemes: ['https'],
    host: 'swagger.example.test',
    basePath: '/v1',
    consumes: ['application/json'],
    paths: {
      '/widgets': {
        post: {
          operationId: 'createSwaggerWidget',
          parameters: [{
            name: 'payload',
            in: 'body',
            schema: {
              type: 'object',
              example: { name: 'swagger' }
            }
          }],
          responses: { 201: { description: 'Created' } }
        }
      }
    }
  }));
  const swaggerBody = await store.importCollection(swaggerBodyPath);
  assert.equal(swaggerBody.requests[0].url, 'https://swagger.example.test/v1/widgets');
  assert.equal(swaggerBody.requests[0].bodyType, 'RAW_JSON');
  assert.match(swaggerBody.requests[0].body, /swagger/);

  const swaggerFormPath = path.join(dir, 'swagger-form.json');
  await fs.writeFile(swaggerFormPath, JSON.stringify({
    swagger: '2.0',
    info: { title: 'Swagger Form API', version: '1.0.0' },
    schemes: ['https'],
    host: 'swagger.example.test',
    consumes: ['multipart/form-data'],
    paths: {
      '/upload': {
        post: {
          operationId: 'uploadSwaggerFile',
          parameters: [
            { name: 'file', in: 'formData', type: 'file' },
            { name: 'token', in: 'formData', type: 'string', default: 'form-token' }
          ],
          responses: { 200: { description: 'Uploaded' } }
        }
      }
    }
  }));
  const swaggerForm = await store.importCollection(swaggerFormPath);
  assert.equal(swaggerForm.requests[0].headers.find((header) => header.key === 'Content-Type').value, 'multipart/form-data');
  assert.match(swaggerForm.requests[0].body, /token=form-token/);
  assert.equal(swaggerForm.requests[0].variables.find((variable) => variable.key === 'openapi.formData.file.file').value, 'true');
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
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'Authorization', value: 'Bearer secret' },
            { name: 'Authorization ', value: 'Bearer whitespace-secret' },
            { name: 'Proxy-Authorization', value: 'Basic proxy-secret' },
            { name: 'Cookie', value: 'explicit=one' },
            { name: 'Set-Cookie', value: 'request-side=secret' }
          ],
          cookies: [
            { name: 'session', value: 'abc', path: '/', domain: 'api.example.test', httpOnly: true, sameSite: 'Strict' },
            { name: 'theme', value: 'dark', path: '/widgets', vendorMetadata: { unsupported: true } },
            { name: 'empty', value: '', path: '/' }
          ],
          queryString: [{ name: 'trace', value: '1' }],
          postData: { mimeType: 'application/json', text: '{"name":"hammer"}', encoding: 'utf8' }
        },
        response: {
          status: 201,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          cookies: [
            { name: 'seen', value: 'yes', path: '/', domain: 'api.example.test', expires: 'Wed, 21 Oct 2099 07:28:00 GMT', httpOnly: true, secure: true, sameSite: 'None' },
            { name: 'prefs', value: 'light', path: '/widgets', secure: true, priority: 'High', partitioned: true, vendorMetadata: { unsupported: true } }
          ],
          redirectURL: 'https://api.example.test/widgets/w1',
          content: { mimeType: 'application/json', text: '{"id":"w1"}', encoding: 'base64', compression: 12 }
        },
        time: 123
      }]
    }
  }));

  const collection = await store.importCollection(importPath);
  assert.equal(collection.requests[0].method, 'POST');
  assert.equal(collection.requests[0].queryParams[0].key, 'trace');
  assert.equal(collection.requests[0].bodyType, 'RAW_JSON');
  assert.equal(collection.requests[0].headers.find((header) => header.key === 'Cookie').value, 'explicit=one; session=abc; theme=dark; empty=');
  assert.equal(collection.requests[0].examples[0].statusCode, 201);
  assert.equal(collection.requests[0].examples[0].headers.filter((header) => header.key === 'Set-Cookie').length, 2);
  assert.equal(
    collection.requests[0].examples[0].headers.find((header) => header.key === 'Set-Cookie').value,
    'seen=yes; Path=/; Domain=api.example.test; Expires=Wed, 21 Oct 2099 07:28:00 GMT; HttpOnly; Secure; SameSite=None'
  );
  assert.equal(
    collection.requests[0].examples[0].headers.filter((header) => header.key === 'Set-Cookie')[1].value,
    'prefs=light; Path=/widgets; Secure; Priority=High; Partitioned'
  );
  assert.equal(
    collection.requests[0].examples[0].headers.some((header) => /vendorMetadata|unsupported/.test(header.value)),
    false
  );
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.responseTimeMillis').value, '123');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.requestBodyEncoding').value, 'utf8');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.redirectUrl').value, 'https://api.example.test/widgets/w1');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.responseBodyEncoding').value, 'base64');
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'har.responseCompressionBytes').value, '12');

  const exportPath = path.join(dir, 'export.har');
  await store.exportCollection(collection, exportPath, { format: 'har' });
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(exported.log.version, '1.2');
  assert.equal(exported.log.entries[0].request.method, 'POST');
  assert.equal(exported.log.entries[0].request.headers.find((header) => header.name === 'Cookie').value, '<redacted>');
  assert.equal(exported.log.entries[0].request.headers.find((header) => header.name === 'Authorization').value, '<redacted>');
  assert.equal(exported.log.entries[0].request.headers.find((header) => header.name === 'Authorization ').value, '<redacted>');
  assert.equal(exported.log.entries[0].request.headers.find((header) => header.name === 'Proxy-Authorization').value, '<redacted>');
  assert.equal(exported.log.entries[0].request.headers.find((header) => header.name === 'Set-Cookie').value, '<redacted>');
  assert.deepEqual(exported.log.entries[0].request.cookies.map((cookie) => cookie.name), ['explicit', 'session', 'theme', 'empty']);
  assert.deepEqual(exported.log.entries[0].request.cookies.map((cookie) => cookie.value), ['<redacted>', '<redacted>', '<redacted>', '<redacted>']);
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
  assert.equal(collection.requests[0].variables.find((variable) => variable.key === 'curl.cacert').value, '/tmp/ca.pem');

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
      cookieJar: { enabled: false, storeResponses: true }
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

test('imports curl auth, redirect, compression, query, binary, and Windows-style quoting variants', async () => {
  const { store, dir } = await tempStore();
  const binaryPath = path.join(dir, 'binary.sh');
  await fs.writeFile(binaryPath, [
    "curl --location --compressed --insecure --user 'alice:secret'",
    "--user-agent 'PostMeter Test/1.0' --referer 'https://app.example.test'",
    "--url 'https://api.example.test/upload' --url-query 'debug=true'",
    "--data-binary '@payload.bin'"
  ].join(' '));

  const binaryCollection = await store.importCollection(binaryPath);
  const binaryRequest = binaryCollection.requests[0];
  assert.equal(binaryRequest.name, 'POST /upload');
  assert.equal(binaryRequest.auth.type, 'basic');
  assert.equal(binaryRequest.auth.username, 'alice');
  assert.equal(binaryRequest.auth.password, 'secret');
  assert.equal(binaryRequest.queryParams.find((param) => param.key === 'debug').value, 'true');
  assert.equal(binaryRequest.body, '@payload.bin');
  assert.equal(binaryRequest.headers.find((header) => header.key === 'User-Agent').value, 'PostMeter Test/1.0');
  assert.equal(binaryRequest.headers.find((header) => header.key === 'Referer').value, 'https://app.example.test');
  assert.equal(binaryRequest.variables.find((variable) => variable.key === 'curl.followRedirects').value, 'true');
  assert.equal(binaryRequest.variables.find((variable) => variable.key === 'curl.compressed').value, 'true');
  assert.equal(binaryRequest.variables.find((variable) => variable.key === 'curl.insecure').value, 'true');
  assert.equal(binaryRequest.variables.find((variable) => variable.key === 'curl.dataBinaryFile').value, 'payload.bin');
  const binaryExportPath = path.join(dir, 'binary-export.sh');
  await store.exportCollection(binaryCollection, binaryExportPath, { format: 'curl' });
  const binaryExported = await fs.readFile(binaryExportPath, 'utf8');
  assert.match(binaryExported, / -u 'alice:secret'/);
  assert.match(binaryExported, / -L/);
  assert.match(binaryExported, / --compressed/);
  assert.match(binaryExported, / -k/);
  assert.match(binaryExported, / --data-binary '@payload\.bin'/);

  const metadataPath = path.join(dir, 'metadata.sh');
  await fs.writeFile(metadataPath, "curl --cert '/tmp/client.pem' --key=/tmp/client.key --connect-timeout 2 --max-time=5 --upload-file './upload.bin' https://api.example.test/files");
  const metadataCollection = await store.importCollection(metadataPath);
  const metadataRequest = metadataCollection.requests[0];
  assert.equal(metadataRequest.method, 'PUT');
  assert.equal(metadataRequest.body, '@./upload.bin');
  assert.equal(metadataRequest.variables.find((variable) => variable.key === 'curl.cert').value, '/tmp/client.pem');
  assert.equal(metadataRequest.variables.find((variable) => variable.key === 'curl.key').value, '/tmp/client.key');
  assert.equal(metadataRequest.variables.find((variable) => variable.key === 'curl.connect-timeout').value, '2');
  assert.equal(metadataRequest.variables.find((variable) => variable.key === 'curl.max-time').value, '5');
  assert.equal(metadataRequest.variables.find((variable) => variable.key === 'curl.uploadFile').value, './upload.bin');

  const formPath = path.join(dir, 'form.sh');
  await fs.writeFile(formPath, "curl -F 'file=@avatar.png' --form-string 'name=Ada' https://api.example.test/profile");
  const formCollection = await store.importCollection(formPath);
  const formRequest = formCollection.requests[0];
  assert.equal(formRequest.method, 'POST');
  assert.equal(formRequest.headers.find((header) => header.key === 'Content-Type').value, 'multipart/form-data');
  assert.match(formRequest.body, /file=@avatar\.png/);
  assert.match(formRequest.body, /name=Ada/);

  const windowsPath = path.join(dir, 'windows.cmd');
  await fs.writeFile(windowsPath, [
    'curl "https://api.example.test/widgets" ^',
    '  -H "X-Trace: two" ^',
    '  --user "bob:s3"'
  ].join('\n'));
  const windowsCollection = await store.importCollection(windowsPath);
  assert.equal(windowsCollection.requests[0].headers.find((header) => header.key === 'X-Trace').value, 'two');
  assert.equal(windowsCollection.requests[0].auth.username, 'bob');
  assert.equal(windowsCollection.requests[0].auth.password, 's3');

  const attachedCaretWindowsPath = path.join(dir, 'windows-attached-caret.cmd');
  await fs.writeFile(attachedCaretWindowsPath, [
    'curl "https://api.example.test/widgets"^',
    '  -H "X-Trace: attached"^',
    '  --user "carol:s4"'
  ].join('\r\n'));
  const attachedCaretWindowsCollection = await store.importCollection(attachedCaretWindowsPath);
  assert.equal(attachedCaretWindowsCollection.requests[0].url, 'https://api.example.test/widgets');
  assert.equal(attachedCaretWindowsCollection.requests[0].headers.find((header) => header.key === 'X-Trace').value, 'attached');
  assert.equal(attachedCaretWindowsCollection.requests[0].auth.username, 'carol');

  const repeatedHeaderPath = path.join(dir, 'repeated-headers.sh');
  await fs.writeFile(repeatedHeaderPath, [
    "curl -H 'X-Repeat: one' -H 'X-Repeat: two' -H 'Accept: application/json' https://api.example.test/repeat"
  ].join('\n'));
  const repeatedHeaderCollection = await store.importCollection(repeatedHeaderPath);
  const repeatedHeaders = repeatedHeaderCollection.requests[0].headers.filter((header) => header.key === 'X-Repeat');
  assert.deepEqual(repeatedHeaders.map((header) => header.value), ['one', 'two']);
  const repeatedHeaderExportPath = path.join(dir, 'repeated-headers-export.sh');
  await store.exportCollection(repeatedHeaderCollection, repeatedHeaderExportPath, { format: 'curl' });
  const repeatedHeaderExported = await fs.readFile(repeatedHeaderExportPath, 'utf8');
  assert.match(repeatedHeaderExported, /-H 'X-Repeat: one'.*-H 'X-Repeat: two'/);

  const repeatedDataPath = path.join(dir, 'repeated-data.sh');
  await fs.writeFile(repeatedDataPath, "curl -G -d 'q=hammer' -d 'limit=10' https://api.example.test/search");
  const repeatedDataCollection = await store.importCollection(repeatedDataPath);
  assert.equal(repeatedDataCollection.requests[0].method, 'GET');
  assert.equal(repeatedDataCollection.requests[0].bodyType, 'NONE');
  assert.equal(repeatedDataCollection.requests[0].queryParams.find((param) => param.key === 'q').value, 'hammer');
  assert.equal(repeatedDataCollection.requests[0].queryParams.find((param) => param.key === 'limit').value, '10');
});

test('non-Postman importers reject malformed common inputs with clear errors', async () => {
  const { store, dir } = await tempStore();
  const cases = [
    ['malformed-openapi.json', '{"openapi":"3.1.0",', /Failed to parse JSON collection file:/],
    ['malformed-openapi.yaml', 'openapi: 3.1.0\ninfo:\n  title: [unterminated', /Failed to parse OpenAPI YAML file:/],
    ['malformed.har', '{"log":', /Failed to parse JSON collection file:/],
    ['empty-openapi.json', JSON.stringify({ openapi: '3.1.0', info: { title: 'Empty', version: '1' }, paths: {} }), /OpenAPI document does not contain importable requests/],
    ['empty.har', JSON.stringify({ log: { version: '1.2', entries: [] } }), /HAR document does not contain importable requests/],
    ['missing-url.sh', "curl -H 'X-Test: yes'", /curl command does not include a URL/],
    ['ambiguous.txt', 'this is not an API collection', /File is not a supported PostMeter, Postman, OpenAPI, HAR, or curl collection/]
  ];

  for (const [name, content, message] of cases) {
    const importPath = path.join(dir, name);
    await fs.writeFile(importPath, content);
    await assert.rejects(() => store.importCollection(importPath), message);
  }
});

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-formats-'));
  return {
    dir,
    store: new WorkspaceStore(path.join(dir, 'workspace.json'))
  };
}
