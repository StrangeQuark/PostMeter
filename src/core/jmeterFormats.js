const { collectionModel, keyValue, requestModel } = require('./models');
const {
  assertImportableCollection,
  escapeRegExp,
  flattenCollectionRequests,
  parseRequestUrl,
  xmlEscape,
  xmlUnescape
} = require('./collectionFormatUtils');

function importJMeterPlan(text) {
  if (!/<jmeterTestPlan[\s>]/.test(text) && !/<HTTPSamplerProxy[\s>]/.test(text)) {
    throw new Error('File is not a supported JMeter test plan.');
  }
  const collection = collectionModel({ name: 'Imported JMeter Plan', requests: [], folders: [] });
  importJMeterVariables(text, collection);
  importJMeterCsvDataSets(text, collection);
  importJMeterThreadMetadata(text, collection);
  importJMeterTimerMetadata(text, collection);
  importJMeterControllerMetadata(text, collection);
  importJMeterListenerMetadata(text, collection);
  importUnsupportedJMeterMetadata(text, collection);
  const samplerMatches = [...text.matchAll(/<HTTPSamplerProxy\b([\s\S]*?)<\/HTTPSamplerProxy>/g)];
  for (let index = 0; index < samplerMatches.length; index++) {
    const match = samplerMatches[index];
    const block = match[0];
    const attrs = match[1] || '';
    const name = xmlAttribute(attrs, 'testname') || 'Imported JMeter Request';
    const protocol = xmlStringProp(block, 'HTTPSampler.protocol') || 'https';
    const domain = xmlStringProp(block, 'HTTPSampler.domain');
    const pathName = xmlStringProp(block, 'HTTPSampler.path') || '/';
    const method = xmlStringProp(block, 'HTTPSampler.method') || 'GET';
    if (!domain) {
      continue;
    }
    const request = requestModel({
      name,
      method,
      url: `${protocol}://${domain}${pathName.startsWith('/') ? pathName : `/${pathName}`}`
    });
    for (const arg of xmlHttpArguments(block)) {
      request.queryParams.push(keyValue(arg.name, arg.value));
    }
    const nextSamplerIndex = samplerMatches[index + 1]?.index ?? text.length;
    const samplerHashTree = text.slice(match.index + block.length, nextSamplerIndex);
    request.headers.push(...jmeterHeaderManagerHeaders(samplerHashTree));
    request.assertions.push(...jmeterResponseAssertions(samplerHashTree));
    request.assertions.push(...jmeterDurationAssertions(samplerHashTree));
    request.assertions.push(...jmeterSizeAssertions(samplerHashTree));
    request.assertions.push(...jmeterJsonPathAssertions(samplerHashTree));
    request.assertions.push(...jmeterXmlPathAssertions(samplerHashTree));
    request.assertions.push(...jmeterJsonExtractors(samplerHashTree));
    request.assertions.push(...jmeterRegexExtractors(samplerHashTree));
    collection.requests.push(request);
  }
  assertImportableCollection(collection, 'JMeter test plan');
  return collection;
}

function importJMeterVariables(text, collection) {
  const variableBlockPattern = /<Arguments\b[^>]*testname="User Defined Variables"[\s\S]*?<\/Arguments>/g;
  for (const match of text.matchAll(variableBlockPattern)) {
    for (const arg of xmlHttpArguments(match[0])) {
      collection.variables.push(keyValue(arg.name, arg.value));
    }
  }
}

function importJMeterCsvDataSets(text, collection) {
  const pattern = /<CSVDataSet\b([^>]*)>([\s\S]*?)<\/CSVDataSet>/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlAttribute(match[1] || '', 'testname') || `CSV ${collection.variables.length + 1}`;
    const filename = xmlStringProp(match[2], 'filename');
    const variableNames = xmlStringProp(match[2], 'variableNames');
    if (filename) {
      collection.variables.push(keyValue(`jmeter.csv.${name}.filename`, filename));
    }
    if (variableNames) {
      collection.variables.push(keyValue(`jmeter.csv.${name}.variables`, variableNames));
    }
  }
}

function importJMeterThreadMetadata(text, collection) {
  const threads = xmlStringProp(text, 'ThreadGroup.num_threads');
  const ramp = xmlStringProp(text, 'ThreadGroup.ramp_time');
  if (threads) {
    collection.variables.push(keyValue('jmeter.threadGroup.threads', threads));
  }
  if (ramp) {
    collection.variables.push(keyValue('jmeter.threadGroup.rampSeconds', ramp));
  }
}

function importJMeterTimerMetadata(text, collection) {
  const pattern = /<([A-Za-z]+Timer)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let importedLegacyConstantDelay = false;
  for (const match of text.matchAll(pattern)) {
    const timerClass = match[1];
    const name = xmlAttribute(match[2] || '', 'testname') || timerClass;
    collection.variables.push(keyValue(`jmeter.timer.${name}.class`, timerClass));
    if (timerClass === 'ConstantTimer') {
      const delay = xmlStringProp(match[3], 'ConstantTimer.delay');
      if (delay) {
        collection.variables.push(keyValue(`jmeter.timer.${name}.constantDelayMillis`, delay));
        if (!importedLegacyConstantDelay) {
          collection.variables.push(keyValue('jmeter.timer.constantDelayMillis', delay));
          importedLegacyConstantDelay = true;
        }
      }
    } else {
      for (const prop of xmlStringProps(match[3])) {
        collection.variables.push(keyValue(`jmeter.timer.${name}.${prop.name}`, prop.value));
      }
    }
  }
}

function importJMeterControllerMetadata(text, collection) {
  const pattern = /<(LoopController|IfController|WhileController|ForeachController|OnceOnlyController|GenericController|TransactionController|ThroughputController|RuntimeController)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const match of text.matchAll(pattern)) {
    const controllerClass = match[1];
    const name = xmlAttribute(match[2] || '', 'testname') || controllerClass;
    collection.variables.push(keyValue(`jmeter.controller.${name}.class`, controllerClass));
    for (const prop of xmlStringProps(match[3] || '')) {
      const propName = prop.name.startsWith(`${controllerClass}.`)
        ? prop.name.slice(controllerClass.length + 1)
        : prop.name;
      collection.variables.push(keyValue(`jmeter.controller.${name}.${propName}`, prop.value));
    }
  }
}

function importJMeterListenerMetadata(text, collection) {
  const pattern = /<ResultCollector\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ResultCollector>)/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlAttribute(match[1] || '', 'testname') || `Listener ${collection.variables.length + 1}`;
    collection.variables.push(keyValue(`jmeter.listener.${name}.class`, 'ResultCollector'));
    const filename = xmlStringProp(match[2] || '', 'filename');
    if (filename) {
      collection.variables.push(keyValue(`jmeter.listener.${name}.filename`, filename));
    }
  }
}

function importUnsupportedJMeterMetadata(text, collection) {
  const unsupportedElements = [
    'BeanShellAssertion',
    'BeanShellPostProcessor',
    'BeanShellPreProcessor',
    'BoundaryExtractor',
    'CompareAssertion',
    'DebugSampler',
    'HTMLAssertion',
    'JSR223Assertion',
    'JSR223PostProcessor',
    'JSR223PreProcessor',
    'JSR223Sampler',
    'MD5HexAssertion',
    'SMIMEAssertion',
    'XMLSchemaAssertion',
    'XMLAssertion'
  ];
  for (const elementName of unsupportedElements) {
    const pattern = new RegExp(`<${elementName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${elementName}>)`, 'g');
    for (const match of text.matchAll(pattern)) {
      const attrs = match[1] || '';
      const block = match[2] || '';
      const name = xmlAttribute(attrs, 'testname') || elementName;
      const prefix = `jmeter.unsupported.${name}`;
      collection.variables.push(keyValue(`${prefix}.class`, elementName));
      if (xmlAttribute(attrs, 'enabled')) {
        collection.variables.push(keyValue(`${prefix}.enabled`, xmlAttribute(attrs, 'enabled')));
      }
      for (const prop of xmlStringProps(block).slice(0, 25)) {
        if (prop.name) {
          collection.variables.push(keyValue(`${prefix}.${prop.name}`, prop.value));
        }
      }
    }
  }
}

function jmeterHeaderManagerHeaders(text) {
  const headers = [];
  const pattern = /<HeaderManager\b[^>]*>([\s\S]*?)<\/HeaderManager>/g;
  for (const match of text.matchAll(pattern)) {
    const headerPattern = /<elementProp\b[^>]*elementType="Header"[^>]*>([\s\S]*?)<\/elementProp>/g;
    for (const header of match[1].matchAll(headerPattern)) {
      const name = xmlStringProp(header[1], 'Header.name');
      if (name) {
        headers.push(keyValue(name, xmlStringProp(header[1], 'Header.value')));
      }
    }
  }
  return headers;
}

function jmeterResponseAssertions(text) {
  const assertions = [];
  const pattern = /<ResponseAssertion\b([^>]*)>([\s\S]*?)<\/ResponseAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[1] || '';
    const name = xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter Response Assertion');
    const enabled = xmlAttribute(attrs, 'enabled') !== 'false';
    const block = match[2] || '';
    const field = xmlStringProp(block, 'Assertion.test_field');
    const patternValue = firstAssertionPattern(block);
    if (!patternValue) {
      continue;
    }
    if (field === 'Assertion.response_code') {
      assertions.push({
        enabled,
        type: 'statusCode',
        name,
        path: '',
        operator: 'equals',
        expected: patternValue,
        variableName: ''
      });
    } else if (field === 'Assertion.response_data' || field === 'Assertion.response_message') {
      assertions.push({
        enabled,
        type: 'bodyContains',
        name,
        path: '',
        operator: 'contains',
        expected: patternValue,
        variableName: ''
      });
    }
  }
  return assertions;
}

function jmeterDurationAssertions(text) {
  const assertions = [];
  const pattern = /<DurationAssertion\b([^>]*)>([\s\S]*?)<\/DurationAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[1] || '';
    const enabled = xmlAttribute(attrs, 'enabled') !== 'false';
    const expected = xmlStringProp(match[2] || '', 'DurationAssertion.duration');
    if (!expected) {
      continue;
    }
    assertions.push({
      enabled,
      type: 'responseTime',
      name: xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter Duration Assertion'),
      path: '',
      operator: 'lessThan',
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterSizeAssertions(text) {
  const assertions = [];
  const pattern = /<SizeAssertion\b([^>]*)>([\s\S]*?)<\/SizeAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[1] || '';
    const enabled = xmlAttribute(attrs, 'enabled') !== 'false';
    const block = match[2] || '';
    const expected = xmlStringProp(block, 'SizeAssertion.size');
    if (!expected) {
      continue;
    }
    assertions.push({
      enabled,
      type: 'responseSize',
      name: xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter Size Assertion'),
      path: '',
      operator: jmeterSizeOperatorToPostMeter(xmlStringProp(block, 'SizeAssertion.operator')),
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterJsonPathAssertions(text) {
  const assertions = [];
  const pattern = /<JSONPathAssertion\b([^>]*)>([\s\S]*?)<\/JSONPathAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[1] || '';
    const enabled = xmlAttribute(attrs, 'enabled') !== 'false';
    const block = match[2] || '';
    const path = xmlStringProp(block, 'JSON_PATH');
    if (!path) {
      continue;
    }
    const expected = xmlStringProp(block, 'EXPECTED_VALUE');
    assertions.push({
      enabled,
      type: 'jsonPath',
      name: xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter JSONPath Assertion'),
      path,
      operator: expected ? 'equals' : 'exists',
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterXmlPathAssertions(text) {
  const assertions = [];
  const pattern = /<(XPathAssertion|XPath2Assertion)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[2] || '';
    const block = match[3] || '';
    const path = xmlStringProp(block, 'XPath.xpath')
      || xmlStringProp(block, 'XPath2.xpath')
      || xmlStringProp(block, 'xpath');
    if (!path) {
      continue;
    }
    assertions.push({
      enabled: xmlAttribute(attrs, 'enabled') !== 'false',
      type: 'xmlPath',
      name: xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter XPath Assertion'),
      path,
      operator: 'exists',
      expected: '',
      variableName: ''
    });
  }
  return assertions;
}

function jmeterJsonExtractors(text) {
  const assertions = [];
  const pattern = /<JSONPostProcessor\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/JSONPostProcessor>/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlUnescape(match[1] || 'JMeter JSON Extractor');
    const block = match[2] || '';
    const names = splitJMeterList(xmlStringProp(block, 'JSONPostProcessor.referenceNames'));
    const paths = splitJMeterList(xmlStringProp(block, 'JSONPostProcessor.jsonPathExprs'));
    for (let index = 0; index < Math.min(names.length, paths.length); index++) {
      if (!names[index] || !paths[index]) {
        continue;
      }
      assertions.push({
        enabled: true,
        type: 'extractVariable',
        name: names[index],
        path: paths[index],
        operator: 'exists',
        expected: '',
        variableName: names[index],
        source: name
      });
    }
  }
  return assertions;
}

function jmeterRegexExtractors(text) {
  const assertions = [];
  const pattern = /<RegexExtractor\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/RegexExtractor>/g;
  for (const match of text.matchAll(pattern)) {
    const block = match[2] || '';
    const variableName = xmlStringProp(block, 'RegexExtractor.refname');
    const regex = xmlStringProp(block, 'RegexExtractor.regex');
    if (!variableName || !regex) {
      continue;
    }
    assertions.push({
      enabled: true,
      type: 'extractRegex',
      name: xmlUnescape(match[1] || variableName),
      path: '',
      operator: 'exists',
      expected: regex,
      variableName
    });
  }
  return assertions;
}

function firstAssertionPattern(block) {
  const match = /<collectionProp\s+name="Asserion\.test_strings">([\s\S]*?)<\/collectionProp>/.exec(block)
    || /<collectionProp\s+name="Assertion\.test_strings">([\s\S]*?)<\/collectionProp>/.exec(block);
  if (!match) {
    return '';
  }
  const value = /<stringProp\b[^>]*>([\s\S]*?)<\/stringProp>/.exec(match[1]);
  return value ? xmlUnescape(value[1]) : '';
}

function exportJMeterPlan(collection) {
  const samplers = flattenCollectionRequests(collection)
    .map(({ request }) => requestToJMeterSampler(request))
    .join('\n');
  const variables = collectionVariablesToJMeter(collection);
  const metadata = jmeterMetadataToJMeter(collection);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">\n  <hashTree>\n    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${xmlEscape(collection.name || 'PostMeter Collection')}" enabled="true"/>\n    <hashTree>\n${variables}${metadata}${samplers}\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>\n`;
}

function requestToJMeterSampler(request) {
  const parsed = parseRequestUrl(request.url);
  const protocol = parsed?.protocol.replace(':', '') || 'https';
  const domain = parsed?.hostname || request.url.replace(/^https?:\/\//i, '').split('/')[0] || '{{host}}';
  const pathName = parsed ? `${parsed.pathname}${parsed.search}` : '/';
  const args = (request.queryParams || [])
    .filter((pair) => pair.enabled !== false && pair.key)
    .map((pair) => `            <elementProp name="${xmlEscape(pair.key)}" elementType="HTTPArgument">\n              <stringProp name="Argument.name">${xmlEscape(pair.key)}</stringProp>\n              <stringProp name="Argument.value">${xmlEscape(pair.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  const assertions = requestAssertionsToJMeter(request);
  const headers = requestHeadersToJMeter(request);
  return `      <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEscape(request.name || 'Request')}" enabled="true">\n        <stringProp name="HTTPSampler.domain">${xmlEscape(domain)}</stringProp>\n        <stringProp name="HTTPSampler.protocol">${xmlEscape(protocol)}</stringProp>\n        <stringProp name="HTTPSampler.path">${xmlEscape(pathName)}</stringProp>\n        <stringProp name="HTTPSampler.method">${xmlEscape(request.method || 'GET')}</stringProp>\n        <elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n          <collectionProp name="Arguments.arguments">\n${args}\n          </collectionProp>\n        </elementProp>\n      </HTTPSamplerProxy>\n      <hashTree>\n${headers}${assertions}      </hashTree>`;
}

function collectionVariablesToJMeter(collection) {
  const variables = (collection.variables || [])
    .filter((pair) => pair.enabled !== false && pair.key && !pair.key.startsWith('jmeter.csv.') && !pair.key.startsWith('jmeter.threadGroup.') && !pair.key.startsWith('jmeter.timer.') && !pair.key.startsWith('jmeter.controller.') && !pair.key.startsWith('jmeter.listener.') && !pair.key.startsWith('jmeter.unsupported.'))
    .map((pair) => `            <elementProp name="${xmlEscape(pair.key)}" elementType="HTTPArgument">\n              <stringProp name="Argument.name">${xmlEscape(pair.key)}</stringProp>\n              <stringProp name="Argument.value">${xmlEscape(pair.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  if (!variables) {
    return '';
  }
  return `      <Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">\n        <collectionProp name="Arguments.arguments">\n${variables}\n        </collectionProp>\n      </Arguments>\n      <hashTree/>\n`;
}

function jmeterMetadataToJMeter(collection) {
  const pairs = (collection.variables || []).filter((pair) => pair.enabled !== false && pair.key);
  return `${jmeterTimersToJMeter(pairs)}${jmeterControllersToJMeter(pairs)}${unsupportedJMeterMetadataToJMeter(pairs)}`;
}

function jmeterTimersToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.timer.');
  return Object.entries(groups).map(([name, props]) => {
    const timerClass = props.class;
    if (!timerClass || !/^[A-Za-z]+Timer$/.test(timerClass)) {
      return '';
    }
    const guiClass = timerClass === 'ConstantTimer' ? 'ConstantTimerGui' : 'TestBeanGUI';
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => {
        const propName = timerClass === 'ConstantTimer' && prop === 'constantDelayMillis'
          ? 'ConstantTimer.delay'
          : prop;
        return `        <stringProp name="${xmlEscape(propName)}">${xmlEscape(value)}</stringProp>`;
      })
      .join('\n');
    return `      <${timerClass} guiclass="${guiClass}" testclass="${timerClass}" testname="${xmlEscape(name)}" enabled="true">\n${body}\n      </${timerClass}>\n      <hashTree/>\n`;
  }).join('');
}

function jmeterControllersToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.controller.');
  return Object.entries(groups).map(([name, props]) => {
    const controllerClass = props.class;
    if (!controllerClass || !/^[A-Za-z]+Controller$/.test(controllerClass)) {
      return '';
    }
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => `        <stringProp name="${xmlEscape(prop)}">${xmlEscape(value)}</stringProp>`)
      .join('\n');
    return `      <${controllerClass} guiclass="${controllerClass}Gui" testclass="${controllerClass}" testname="${xmlEscape(name)}" enabled="true">\n${body}\n      </${controllerClass}>\n      <hashTree/>\n`;
  }).join('');
}

function unsupportedJMeterMetadataToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.unsupported.');
  return Object.entries(groups).map(([name, props]) => {
    const elementClass = props.class;
    if (!elementClass || !/^[A-Za-z0-9]+$/.test(elementClass)) {
      return '';
    }
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => `        <stringProp name="${xmlEscape(prop)}">${xmlEscape(value)}</stringProp>`)
      .join('\n');
    return `      <${elementClass} guiclass="TestBeanGUI" testclass="${xmlEscape(elementClass)}" testname="${xmlEscape(name)}" enabled="false">\n${body}\n      </${elementClass}>\n      <hashTree/>\n`;
  }).join('');
}

function groupedJMeterMetadata(pairs, prefix) {
  const groups = {};
  for (const pair of pairs) {
    if (!String(pair.key).startsWith(prefix)) {
      continue;
    }
    const rest = String(pair.key).slice(prefix.length);
    const separator = rest.lastIndexOf('.');
    if (separator <= 0) {
      continue;
    }
    const name = rest.slice(0, separator);
    const prop = rest.slice(separator + 1);
    groups[name] ||= {};
    groups[name][prop] = pair.value ?? '';
  }
  return groups;
}

function requestAssertionsToJMeter(request) {
  return (request.assertions || [])
    .filter((assertion) => assertion.enabled !== false)
    .map((assertion) => {
      if (assertion.type === 'statusCode' && assertion.operator === 'equals' && assertion.expected) {
        return responseAssertionToJMeter(assertion.name || 'Status Code', 'Assertion.response_code', assertion.expected);
      }
      if (assertion.type === 'bodyContains' && assertion.expected) {
        return responseAssertionToJMeter(assertion.name || 'Body Contains', 'Assertion.response_data', assertion.expected);
      }
      if (assertion.type === 'responseTime' && assertion.operator === 'lessThan' && assertion.expected) {
        return durationAssertionToJMeter(assertion.name || 'Response Time', assertion.expected);
      }
      if (assertion.type === 'responseSize' && assertion.expected) {
        return sizeAssertionToJMeter(assertion.name || 'Response Size', assertion.expected, assertion.operator);
      }
      if (assertion.type === 'jsonPath' && assertion.path) {
        return jsonPathAssertionToJMeter(assertion.name || 'JSON Path', assertion.path, assertion.operator === 'exists' ? '' : assertion.expected);
      }
      if (assertion.type === 'xmlPath' && assertion.path && assertion.operator === 'exists') {
        return xPathAssertionToJMeter(assertion.name || 'XML XPath', assertion.path);
      }
      if (assertion.type === 'extractVariable' && assertion.path && (assertion.variableName || assertion.name)) {
        return jsonExtractorToJMeter(assertion.name || assertion.variableName || 'JSON Extractor', assertion.variableName || assertion.name, assertion.path);
      }
      if (assertion.type === 'extractRegex' && assertion.expected && (assertion.variableName || assertion.name)) {
        return regexExtractorToJMeter(assertion.name || assertion.variableName || 'Regex Extractor', assertion.variableName || assertion.name, assertion.expected);
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

function requestHeadersToJMeter(request) {
  const headers = (request.headers || [])
    .filter((header) => header.enabled !== false && header.key)
    .map((header) => `            <elementProp name="${xmlEscape(header.key)}" elementType="Header">\n              <stringProp name="Header.name">${xmlEscape(header.key)}</stringProp>\n              <stringProp name="Header.value">${xmlEscape(header.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  if (!headers) {
    return '';
  }
  return `        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">\n          <collectionProp name="HeaderManager.headers">\n${headers}\n          </collectionProp>\n        </HeaderManager>\n        <hashTree/>\n`;
}

function responseAssertionToJMeter(name, field, expected) {
  return `        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <collectionProp name="Asserion.test_strings">\n            <stringProp name="${xmlEscape(expected)}">${xmlEscape(expected)}</stringProp>\n          </collectionProp>\n          <stringProp name="Assertion.test_field">${xmlEscape(field)}</stringProp>\n          <boolProp name="Assertion.assume_success">false</boolProp>\n          <intProp name="Assertion.test_type">2</intProp>\n        </ResponseAssertion>\n        <hashTree/>\n`;
}

function durationAssertionToJMeter(name, expected) {
  return `        <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="DurationAssertion.duration">${xmlEscape(expected)}</stringProp>\n        </DurationAssertion>\n        <hashTree/>\n`;
}

function sizeAssertionToJMeter(name, expected, operator) {
  return `        <SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="SizeAssertion.size">${xmlEscape(expected)}</stringProp>\n          <stringProp name="SizeAssertion.operator">${xmlEscape(postMeterSizeOperatorToJMeter(operator))}</stringProp>\n        </SizeAssertion>\n        <hashTree/>\n`;
}

function jsonPathAssertionToJMeter(name, path, expected) {
  return `        <JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="JSON_PATH">${xmlEscape(path)}</stringProp>\n          <stringProp name="EXPECTED_VALUE">${xmlEscape(expected || '')}</stringProp>\n          <boolProp name="JSONVALIDATION">true</boolProp>\n          <boolProp name="EXPECT_NULL">false</boolProp>\n          <boolProp name="INVERT">false</boolProp>\n        </JSONPathAssertion>\n        <hashTree/>\n`;
}

function xPathAssertionToJMeter(name, path) {
  return `        <XPathAssertion guiclass="XPathAssertionGui" testclass="XPathAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="XPath.xpath">${xmlEscape(path)}</stringProp>\n          <boolProp name="XPath.negate">false</boolProp>\n        </XPathAssertion>\n        <hashTree/>\n`;
}

function jsonExtractorToJMeter(name, variableName, path) {
  return `        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="JSONPostProcessor.referenceNames">${xmlEscape(variableName)}</stringProp>\n          <stringProp name="JSONPostProcessor.jsonPathExprs">${xmlEscape(path)}</stringProp>\n          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>\n          <stringProp name="JSONPostProcessor.defaultValues"></stringProp>\n        </JSONPostProcessor>\n        <hashTree/>\n`;
}

function regexExtractorToJMeter(name, variableName, regex) {
  return `        <RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="RegexExtractor.useHeaders">false</stringProp>\n          <stringProp name="RegexExtractor.refname">${xmlEscape(variableName)}</stringProp>\n          <stringProp name="RegexExtractor.regex">${xmlEscape(regex)}</stringProp>\n          <stringProp name="RegexExtractor.template">$1$</stringProp>\n          <stringProp name="RegexExtractor.default"></stringProp>\n        </RegexExtractor>\n        <hashTree/>\n`;
}

function jmeterSizeOperatorToPostMeter(value) {
  return {
    1: 'equals',
    2: 'notEquals',
    3: 'greaterThan',
    4: 'lessThan'
  }[String(value || '').trim()] || 'lessThan';
}

function postMeterSizeOperatorToJMeter(value) {
  return {
    equals: '1',
    notEquals: '2',
    greaterThan: '3',
    lessThan: '4'
  }[String(value || '').trim()] || '4';
}

function xmlHttpArguments(block) {
  const args = [];
  const pattern = /<elementProp\b[^>]*elementType="HTTPArgument"[^>]*>([\s\S]*?)<\/elementProp>/g;
  let match;
  while ((match = pattern.exec(block))) {
    args.push({
      name: xmlStringProp(match[1], 'Argument.name'),
      value: xmlStringProp(match[1], 'Argument.value')
    });
  }
  return args.filter((arg) => arg.name);
}

function xmlStringProp(block, name) {
  const escaped = escapeRegExp(name);
  const match = new RegExp(`<stringProp\\s+name="${escaped}">([\\s\\S]*?)<\\/stringProp>`).exec(block);
  return match ? xmlUnescape(match[1]) : '';
}

function xmlStringProps(block) {
  const props = [];
  const pattern = /<stringProp\s+name="([^"]*)">([\s\S]*?)<\/stringProp>/g;
  for (const match of String(block || '').matchAll(pattern)) {
    props.push({ name: xmlUnescape(match[1]), value: xmlUnescape(match[2]) });
  }
  return props;
}

function splitJMeterList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function xmlAttribute(text, name) {
  const match = new RegExp(`${escapeRegExp(name)}="([^"]*)"`).exec(text);
  return match ? xmlUnescape(match[1]) : '';
}

module.exports = {
  exportJMeterPlan,
  importJMeterPlan
};
