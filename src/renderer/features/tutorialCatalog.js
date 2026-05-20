'use strict';

(function attachTutorialCatalog(global) {
  function createTutorials(dependencies = {}) {
  const {
    tutorialEnsureAuthRefreshAutoDetectExample,
    tutorialEnsureAuthRefreshDetails,
    tutorialEnsureAuthRefreshManageMenu,
    tutorialEnsureAuthRefreshPanel,
    tutorialEnsureClientCertificateModal,
    tutorialEnsureClientCertificateModalFormat,
    tutorialEnsureCollectionRequestContext,
    tutorialEnsureCookieDomainInput,
    tutorialEnsureCookiesClearMenu,
    tutorialEnsureCookiesModal,
    tutorialEnsureCsvVariablesValuesPanel,
    tutorialEnsureEnvironmentContext,
    tutorialEnsureGeneratedHeadersContext,
    tutorialEnsureLocalhostCookieDomain,
    tutorialEnsureLocalhostCookieEditor,
    tutorialEnsurePerformanceAdvancedSettings,
    tutorialEnsurePerformanceCaptureSettings,
    tutorialEnsurePerformanceContext,
    tutorialEnsurePerformanceCsvVariablesModal,
    tutorialEnsurePerformanceTypeContext,
    tutorialEnsureRawRequestBodyContext,
    tutorialEnsureRequestAuthContext,
    tutorialEnsureRequestBodyContext,
    tutorialEnsureRequestCertificateSettingsContext,
    tutorialEnsureRequestCookieSettingsContext,
    tutorialEnsureRequestResultsContext,
    tutorialEnsureRequestSettingsOverviewContext,
    tutorialEnsureRunnerAdvancedSettings,
    tutorialEnsureRunnerCaptureSettings,
    tutorialEnsureRunnerContext,
    tutorialEnsureRunnerCsvVariablesModal,
    tutorialEnsureSettingsModal,
    tutorialEnsureSettingsSection,
    tutorialEnsureToolbarMenu,
    tutorialEnsureWorkspaceContext
  } = dependencies;

  function csvVariableTutorialSteps(prefix) {
    const normalizedPrefix = prefix === 'performance' ? 'performance' : 'runner';
    const noun = normalizedPrefix === 'performance' ? 'performance test' : 'runner';
    const context = normalizedPrefix === 'performance' ? tutorialEnsurePerformanceContext : tutorialEnsureRunnerContext;
    const modalContext = normalizedPrefix === 'performance' ? tutorialEnsurePerformanceCsvVariablesModal : tutorialEnsureRunnerCsvVariablesModal;
    const valuesPanelContext = () => tutorialEnsureCsvVariablesValuesPanel(normalizedPrefix);
    const buttonId = `${normalizedPrefix}CsvVariablesButton`;
    const menuId = `${normalizedPrefix}CsvVariablesMenu`;
    const toggleButtonId = `${normalizedPrefix}ToggleCsvVariablesButton`;
    const editButtonId = `${normalizedPrefix}EditCsvVariablesButton`;
    return Object.freeze([
      {
        selector: `#${buttonId}`,
        title: 'Open CSV variables',
        body: 'CSV variables let each request iteration resolve values from CSV data.',
        beforeStep: context
      },
      {
        selector: `#${toggleButtonId}`,
        title: 'Turn CSV variables on',
        body: 'Enable CSV variables after the schema and data source are configured.',
        beforeStep: () => tutorialEnsureToolbarMenu(buttonId, menuId)
      },
      {
        selector: `#${editButtonId}`,
        title: 'Edit CSV variables',
        body: `The Edit action opens the shared CSV variables editor for this ${noun}.`,
        beforeStep: () => tutorialEnsureToolbarMenu(buttonId, menuId)
      },
      {
        selector: '#csvVariablesSchemaInput',
        title: 'Define the schema',
        body: 'The schema names the variables that CSV rows will provide, such as userId, accountId, or requestBody.',
        beforeStep: modalContext
      },
      {
        selector: '#csvVariablesSourceSection',
        title: 'Review the CSV data source',
        body: 'CSV data source chooses whether executions read rows from a local file reference or from inline rows saved with this item.',
        beforeStep: modalContext
      },
      {
        selector: '#csvVariablesImportButton',
        title: 'Import a CSV file',
        body: 'Import CSV lets you select a local CSV file, then keep it as a file reference or load its contents into the inline editor.',
        beforeStep: modalContext
      },
      {
        selector: '#csvVariablesValuesPanel',
        title: 'Add inline rows',
        body: 'Inline rows are saved with the runner or performance test and can be used instead of a file reference.',
        beforeStep: valuesPanelContext
      },
      {
        selector: '#csvVariablesRowSection',
        title: 'Choose row usage',
        body: 'CSV row usage controls what happens when executions need rows: reuse one row, loop rows, or continue without CSV data after rows run out.',
        beforeStep: valuesPanelContext
      },
      {
        selector: '#csvVariablesReuseFirstRowOption',
        title: 'Reuse the first row',
        body: 'Use the first CSV row for every request when each iteration should resolve the same CSV values.',
        beforeStep: valuesPanelContext
      },
      {
        selector: '#csvVariablesLoopRowsOption',
        title: 'Loop CSV rows',
        body: 'Loop rows starts again at the first CSV row when a runner or performance test needs more iterations than the data provides.',
        beforeStep: valuesPanelContext
      },
      {
        selector: '#csvVariablesContinueWithoutRowsOption',
        title: 'Continue without rows',
        body: 'Continue without rows lets remaining executions run without CSV values after PostMeter reaches the end of the data.',
        beforeStep: valuesPanelContext
      }
    ]);
  }
  function authRefreshTutorialSteps(prefix) {
    const normalizedPrefix = prefix === 'performance' ? 'performance' : 'runner';
    const context = normalizedPrefix === 'performance' ? tutorialEnsurePerformanceContext : tutorialEnsureRunnerContext;
    return Object.freeze([
      {
        selector: `#${normalizedPrefix}AuthRefreshButton`,
        title: 'Open refreshing auth',
        body: 'Refreshing Auth keeps long sequences supplied with fresh tokens or credentials.',
        beforeStep: context
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshCredentialTypeField`,
        title: 'Choose the credential type',
        body: 'Refreshing Auth can manage Bearer/JWT tokens, API keys, cookies, AWS temporary credentials, or custom headers.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshRequestCard`,
        title: 'Select the auth request',
        body: 'The auth request is the request PostMeter runs to obtain the next credential value.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshManageRequestButton`,
        title: 'Open auth request actions',
        body: 'Click Manage when you need to open, auto-detect, create, import, or remove the auth request used for refreshing credentials.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshManageRequestMenu`,
        title: 'Review auth request actions',
        body: 'Manage lets you open the selected auth request, auto-detect response mappings, create a new auth request, import an existing request, or remove the selected auth request.',
        beforeStep: () => tutorialEnsureAuthRefreshManageMenu(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshAutoDetectRequestButton`,
        title: 'Start Auto-Detect',
        body: 'Auto-Detect sends the auth request and looks for token-like values in the response body, headers, and cookies.',
        beforeStep: () => tutorialEnsureAuthRefreshManageMenu(normalizedPrefix)
      },
      {
        selector: '#authRefreshAutoDetectModal',
        title: 'Review Auto-Detect suggestions',
        body: 'The Auto-Detect panel groups compatible response values by body, header, and cookie. Pick the value PostMeter should save, then confirm to fill the source and path fields.',
        beforeStep: () => tutorialEnsureAuthRefreshAutoDetectExample(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshAccessTokenPanel`,
        title: 'Read from the response',
        body: 'Choose where the credential comes from and the exact body path, header name, or cookie name PostMeter should read after the auth request completes.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshAccessTokenPathField`,
        title: 'Map the token path',
        body: 'The path tells PostMeter exactly where the new access token or credential appears in the auth response.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshScheduleSection`,
        title: 'Set the refresh interval',
        body: 'Use the interval to refresh credentials before long workflows expire.',
        beforeStep: () => tutorialEnsureAuthRefreshPanel(normalizedPrefix)
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshRefreshTokenDetails`,
        title: 'Review refresh token settings',
        body: 'Refresh Token works like the normal auth request, but it runs when the access-token request needs a refreshed refresh token first.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'refreshToken')
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshAdvancedDetails`,
        title: 'Open advanced auth refresh settings',
        body: 'Advanced settings control the variable names and failure policy used by refreshed credentials.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'advanced')
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshAccessTokenVariableField`,
        title: 'Save the access token',
        body: 'Save Access Token To controls the variable name that receives the refreshed Bearer or JWT token.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'advanced')
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshRefreshTokenVariableField`,
        title: 'Save the refresh token',
        body: 'Save Refresh Token To controls where a newly returned refresh token is stored for the next refresh cycle.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'advanced')
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshBeforeRunOption`,
        title: 'Refresh before the run',
        body: 'Refresh before run starts forces PostMeter to fetch credentials once before the first runner or performance request executes.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'advanced')
      },
      {
        selector: `#${normalizedPrefix}AuthRefreshFailurePolicyField`,
        title: 'Choose the failure policy',
        body: 'On Failure decides whether PostMeter aborts the run when credential refresh fails or continues with the existing values.',
        beforeStep: () => tutorialEnsureAuthRefreshDetails(normalizedPrefix, 'advanced')
      }
    ]);
  }
  const TUTORIALS = Object.freeze([
    {
      id: 'request',
      title: 'Request',
      level: 'Complete',
      duration: '10 minutes',
      summary: 'Create and send a request, then use params, headers, auth, body, scripts, variables, docs, settings, and response evidence tabs.',
      steps: Object.freeze([
        {
          selector: '#newMenuButton',
          title: 'Start from New',
          body: 'Use New to create requests, collections, environments, runners, performance tests, and workspaces.'
        },
        {
          selector: '#collectionsPanelTab',
          title: 'Keep requests in Collections',
          body: 'Collections are where saved requests, folders, collection docs, shared auth, scripts, and variables live.'
        },
        {
          selector: '#requestNameTitle',
          title: 'Name the request',
          body: 'The request title is editable. Give saved requests clear names so collections are easy to scan.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#requestEditorPanel .request-line',
          title: 'Use the request bar',
          body: 'The request bar is the main send surface. It keeps the HTTP method, URL, and Send button together above the request detail tabs.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#methodSelect',
          title: 'Choose the HTTP method',
          body: 'The method selector controls whether the request is GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#urlInput',
          title: 'Enter the request URL',
          body: 'Type the full endpoint URL here. Environment variables like {{baseUrl}} can be used in this field.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#sendButton',
          title: 'Send the request',
          body: 'Send runs the active request and shows response evidence in the lower pane.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#requestParamsTabButton',
          title: 'Open Params',
          body: 'Click Params when you want PostMeter to manage the query string as rows instead of editing everything inside the URL field.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#addParamButton',
          title: 'Add query parameters',
          body: 'Use Params for query string values instead of manually editing long URLs.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#requestHeadersTabButton',
          title: 'Open request headers',
          body: 'Headers define request metadata such as content type, API version, correlation IDs, or custom service flags.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: '#addHeaderButton',
          title: 'Add request headers',
          body: 'Use Add Header for explicit request headers. Generated headers can stay separate from the values you save with the request.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('headers')
        },
        {
          selector: '#sendPostMeterTokenField',
          title: 'Add a generated token header',
          body: 'PostMeter token adds a generated correlation header at send time without saving a fixed token value into the request.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('headers')
        },
        {
          selector: '#showGeneratedHeadersField',
          title: 'Show auto-generated headers',
          body: 'Show auto-generated headers expands the header table so generated values are visible beside manually saved headers.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('headers')
        },
        {
          selector: '#headersTable',
          title: 'Review generated headers',
          body: 'The headers table shows enabled manual headers and generated headers together, so you can see what PostMeter will send.',
          beforeStep: tutorialEnsureGeneratedHeadersContext
        },
        {
          selector: '#requestAuthTabButton',
          title: 'Open request auth',
          body: 'Auth keeps credentials and signing settings attached to the request instead of hand-writing Authorization headers.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('headers')
        },
        {
          selector: '#authTypeSelect',
          title: 'Pick an auth type',
          body: 'PostMeter supports common API auth options including Bearer, Basic, API Key, OAuth, AWS, Hawk, Digest, NTLM, JWT, and more.',
          beforeStep: tutorialEnsureRequestAuthContext
        },
        {
          selector: '#requestBodyTabButton',
          title: 'Open Body',
          body: 'Click Body before choosing how a request payload should be represented.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('auth')
        },
        {
          selector: '#bodyTypeSelect',
          title: 'Choose a body type',
          body: 'For POST, PUT, and PATCH requests, the Body tab supports raw JSON, form data, URL-encoded data, binary files, and GraphQL payloads.',
          beforeStep: tutorialEnsureRequestBodyContext
        },
        {
          selector: '#bodyRawFormatSelect',
          title: 'Choose a raw format',
          body: 'Raw body format controls editor highlighting and beautification for text, JavaScript, JSON, HTML, and XML payloads.',
          beforeStep: tutorialEnsureRawRequestBodyContext
        },
        {
          selector: '#requestScriptsTabButton',
          title: 'Open Scripts',
          body: 'Click Scripts before adding pre-request setup or post-request checks.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('body')
        },
        {
          selector: '#preRequestScriptInput',
          title: 'Prepare with pre-request scripts',
          body: 'Pre-request scripts can compute values, update variables, and prepare the request before it is sent.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('scripts')
        },
        {
          selector: '#testScriptInput',
          title: 'Assert with post-request scripts',
          body: 'Post-request scripts can run tests, inspect responses, save values, and drive repeatable API checks.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('scripts')
        },
        {
          selector: '#requestVariablesTabButton',
          title: 'Open Variables',
          body: 'Click Variables when a value belongs to this request instead of an environment, collection, folder, or CSV row.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('scripts')
        },
        {
          selector: '#addRequestVariableButton',
          title: 'Add request variables',
          body: 'Request variables override folder, collection, environment, and CSV values when the same name appears in multiple places.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('collectionVariables')
        },
        {
          selector: '#variablePreview',
          title: 'Review variable resolution',
          body: 'The preview shows which values are available and where each resolved value comes from.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('collectionVariables')
        },
        {
          selector: '#requestSettingsTabButton',
          title: 'Open Settings',
          body: 'Click Settings before changing request-specific transport, cookie, redirect, URL, and TLS behavior.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('collectionVariables')
        },
        {
          selector: '#requestSettingsTab',
          title: 'Review request settings',
          body: 'Settings cover SSL verification, cookie jar behavior, redirects, URL encoding, HTTP parser strictness, and TLS handshake choices.',
          beforeStep: tutorialEnsureRequestSettingsOverviewContext,
          scroll: false
        },
        {
          selector: '#requestDocsTabButton',
          title: 'Open Docs',
          body: 'Click Docs before adding Markdown notes for the request.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('requestSettings')
        },
        {
          selector: '#docsPreview',
          title: 'Document the request',
          body: 'Docs use Markdown so examples, notes, and operational context stay beside the request definition.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('docs')
        },
        {
          selector: '#resultsResponseTabButton',
          title: 'Read the response',
          body: 'Response shows status, timing, size, final URL, and the response body from the last send.',
          beforeStep: () => tutorialEnsureRequestResultsContext('response')
        },
        {
          selector: '#resultsHeadersTabButton',
          title: 'Review response headers',
          body: 'Headers shows the response metadata returned by the server, including content type, caching, and tracing headers.',
          beforeStep: () => tutorialEnsureRequestResultsContext('responseHeaders')
        },
        {
          selector: '#resultsCookiesTabButton',
          title: 'Review response cookies',
          body: 'Cookies shows Set-Cookie evidence so you can see what the server tried to store.',
          beforeStep: () => tutorialEnsureRequestResultsContext('responseCookies')
        },
        {
          selector: '#resultsNetworkTabButton',
          title: 'Review network details',
          body: 'Network shows transport details such as redirects, TLS diagnostics, and request timing when that evidence is available.',
          beforeStep: () => tutorialEnsureRequestResultsContext('responseNetwork')
        },
        {
          selector: '#resultsTestResultsTabButton',
          title: 'Inspect test output',
          body: 'After a send, Test Results shows script assertions and request-script output beside the response evidence.',
          beforeStep: () => tutorialEnsureRequestResultsContext('testResults')
        },
        {
          selector: '#resultsVisualizerTabButton',
          title: 'Render visual output',
          body: 'The Visualizer panel can render script-produced HTML for richer response inspection.',
          beforeStep: () => tutorialEnsureRequestResultsContext('visualizer')
        }
      ])
    },
    {
      id: 'environment-variables',
      title: 'Environment Variables',
      level: 'Beginner',
      duration: '3 minutes',
      summary: 'Create an environment, add variables, select it globally, and reference values in requests.',
      steps: Object.freeze([
        {
          selector: '#environmentsPanelTab',
          title: 'Open Environments',
          body: 'Environments keep reusable values like base URLs, tokens, and account IDs separate from requests.'
        },
        {
          selector: '#environmentTable',
          title: 'Edit variables',
          body: 'Each enabled row defines one variable key and value. New environments start empty so you can add only the values you need.',
          beforeStep: tutorialEnsureEnvironmentContext
        },
        {
          selector: '#addVariableButton',
          title: 'Add more values',
          body: 'Use Add Variable for additional values such as tokens, IDs, or host names.',
          beforeStep: tutorialEnsureEnvironmentContext
        },
        {
          selector: '#environmentSelect',
          title: 'Select the active environment',
          body: 'The top-bar Environment selector controls which environment values requests and runs resolve.',
          beforeStep: tutorialEnsureEnvironmentContext
        },
        {
          selector: '#urlInput',
          title: 'Reference variables in requests',
          body: 'Use double braces in request fields, for example {{baseUrl}}/users. PostMeter highlights valid variables as you type.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        }
      ])
    },
    {
      id: 'runner',
      title: 'Runner',
      level: 'Complete',
      duration: '8 minutes',
      summary: 'Create a runner, configure requests, CSV variables, capture and advanced settings, run workflows, inspect details, and export evidence.',
      steps: Object.freeze([
        {
          selector: '#runnersPanelTab',
          title: 'Open Runners',
          body: 'Runners execute a saved sequence of request copies for repeatable workflows.'
        },
        {
          selector: '#runnerMainTitle',
          title: 'Name the runner',
          body: 'The runner title identifies the saved workflow, such as smoke checks, auth setup, or cleanup.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#addRunnerRequestButton',
          title: 'Add requests to the runner',
          body: 'Use Add Request to create a new runner request or import copies from a collection.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#environmentSelect',
          title: 'Use the active environment',
          body: 'Runner requests use the top-bar Environment selector when resolving variables during the run.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#runnerRequestList',
          title: 'Review the sequence',
          body: 'The request list shows the saved execution order and per-row iteration controls.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#runCollectionButton',
          title: 'Start the runner',
          body: 'Run starts the sequence and streams request results into the lower results panel.',
          beforeStep: tutorialEnsureRunnerContext
        },
        ...csvVariableTutorialSteps('runner'),
        ...authRefreshTutorialSteps('runner'),
        {
          selector: '#runnerCaptureSettingsButton',
          title: 'Open capture settings',
          body: 'Use Capture Settings before a run when you want to control how much runner evidence PostMeter keeps.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#runnerCaptureSettingsPanel',
          title: 'Review capture settings',
          body: 'Capture Settings controls how much evidence PostMeter stores during a runner run: response bodies, preview bytes, pre-request and post-request output, script logs, and local variables.',
          beforeStep: tutorialEnsureRunnerCaptureSettings
        },
        {
          selector: '#runnerAdvancedSettingsButton',
          title: 'Open advanced runner settings',
          body: 'Advanced settings control how the run reacts to failures and whether scripts may write back to the selected environment.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#runnerStopOnFailureField',
          title: 'Stop on failure',
          body: 'Stop on failure ends the sequence when a request or script assertion fails.',
          beforeStep: tutorialEnsureRunnerAdvancedSettings
        },
        {
          selector: '#runnerAllowEnvironmentMutationField',
          title: 'Control environment mutation',
          body: 'Environment mutation lets runner scripts intentionally update the active environment during a workflow.',
          beforeStep: tutorialEnsureRunnerAdvancedSettings
        },
        {
          selector: '#runnerResults',
          title: 'Read runner results',
          body: 'The results area shows run progress, execution rows, status filtering, selected request details, captured response data, script output, tests, logs, and variables for completed runner requests.',
          beforeStep: tutorialEnsureRunnerContext
        },
        {
          selector: '#exportRunnerResultsButton',
          title: 'Export run evidence',
          body: 'Completed runner results can be exported as HTML, JSON, or CSV for review outside PostMeter.',
          beforeStep: tutorialEnsureRunnerContext
        }
      ])
    },
    {
      id: 'performance',
      title: 'Performance Test',
      level: 'Complete',
      duration: '10 minutes',
      summary: 'Create a performance test, configure request details and load modes, calibrate, control captures and safety, run tests, and export evidence.',
      steps: Object.freeze([
        {
          selector: '#performancePanelTab',
          title: 'Open Performance',
          body: 'Performance tests are saved workspace items for checking endpoint behavior under local load.'
        },
        {
          selector: '#performanceMainTitle',
          title: 'Name the performance test',
          body: 'Use a clear name that identifies the endpoint or behavior you are measuring.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#performanceTypeSelect',
          title: 'Choose a test type',
          body: 'Performance tests include Full Endpoint Diagnosis, Latency, RPS / Throughput, Concurrency, Stress, Spike, Soak, and Ramp. Pick the mode that matches the question you need answered.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '.performance-request-editor',
          title: 'Configure the request',
          body: 'Configure the target request with the method, URL, params, headers, auth, body, scripts, variables, request settings, and docs. The performance run sends this request repeatedly according to the selected test type.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#importPerformanceRequestButton',
          title: 'Import a request',
          body: 'Use Import Request when a performance test should copy an existing collection request instead of rebuilding the method, URL, auth, body, and scripts manually.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#performanceEditorSection',
          title: 'Full Endpoint Diagnosis',
          body: 'Full Endpoint Diagnosis is the best first pass for an unfamiliar endpoint. It runs a bounded diagnostic plan and reports latency, response codes, headers, TLS/network evidence, and saturation signals. Inputs: Scope, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('diagnosis')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Latency',
          body: 'Latency measures response-time behavior with a simple fixed sample count. Use it when you care about baseline timing without adding meaningful concurrency. Inputs: Samples and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('latency')
        },
        {
          selector: '#performanceEditorSection',
          title: 'RPS / Throughput',
          body: 'RPS / Throughput measures how quickly the endpoint can complete a fixed number of requests at a chosen concurrency. Use it to compare request rate across builds or environments. Inputs: Requests, Concurrency, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('throughput')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Concurrency',
          body: 'Concurrency runs multiple virtual users, each sending a set number of requests. Use it to check behavior when simultaneous clients are active. Inputs: Virtual Users, Requests / User, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('concurrency')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Stress',
          body: 'Stress gradually moves from a starting user count to a peak user count over several stages. Use it to find where latency or failures begin rising. Inputs: Start Users, Peak Users, Steps, Requests / Step, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('stress')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Spike',
          body: 'Spike tests a sudden jump above baseline traffic. Use it to see whether an endpoint survives abrupt bursts and recovers cleanly. Inputs: Baseline Users, Spike Multiplier, Spike Requests, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('spike')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Soak',
          body: 'Soak keeps steady load running for a duration. Use it to catch degradation, leaks, slow resource exhaustion, or instability that only appears over time. Inputs: Duration, Users, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('soak')
        },
        {
          selector: '#performanceEditorSection',
          title: 'Ramp',
          body: 'Ramp increases users from a start value to a peak across steps. Use it when you want a controlled load increase and per-stage evidence. Inputs: Start Users, Peak Users, Steps, Requests / Step, Max Requests, Max Concurrency, and Max Duration.',
          beforeStep: () => tutorialEnsurePerformanceTypeContext('ramp')
        },
        {
          selector: '#runPerformanceTestButton',
          title: 'Run the test',
          body: 'Run executes the selected performance plan locally and streams progress into the results area.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        ...csvVariableTutorialSteps('performance'),
        ...authRefreshTutorialSteps('performance'),
        {
          selector: '#performanceCaptureSettingsButton',
          title: 'Open capture settings',
          body: 'Use Capture Settings before a run when you want to control how much performance evidence PostMeter keeps.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#performanceCaptureSettingsPanel',
          title: 'Review capture settings',
          body: 'Capture Settings controls how much evidence PostMeter stores during a performance run: response bodies, preview bytes, script output, script logs, local variables, response headers, and transport timings.',
          beforeStep: tutorialEnsurePerformanceCaptureSettings
        },
        {
          selector: '#performanceAdvancedSettingsButton',
          title: 'Open advanced performance settings',
          body: 'Advanced settings control performance-run behavior that should be changed deliberately, such as whether scripts can write back to the selected environment.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#performanceAllowEnvironmentMutationField',
          title: 'Control environment writes',
          body: 'Advanced settings decide whether performance scripts may write values back into the active environment.',
          beforeStep: tutorialEnsurePerformanceAdvancedSettings
        },
        {
          selector: '#performanceResults',
          title: 'Read performance results',
          body: 'The results area shows run progress, aggregate summary, detailed request samples, status filtering, and graph tabs. Use Results for the summary, Requests for individual samples, and Graphs for trends and response-code timelines.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#exportPerformanceResultsButton',
          title: 'Export performance evidence',
          body: 'Completed performance results can be exported as HTML, JSON, or CSV.',
          beforeStep: tutorialEnsurePerformanceContext
        },
        {
          selector: '#calibratePerformanceButton',
          title: 'Calibrate local capacity',
          body: 'Calibration estimates conservative local-machine limits for larger performance runs. Use it after you understand the test type and request shape you want to run.',
          beforeStep: tutorialEnsurePerformanceContext
        }
      ])
    },
    {
      id: 'workspaces-basics',
      title: 'Workspaces',
      level: 'Beginner',
      duration: '4 minutes',
      summary: 'Use the Workspaces panel to switch, inspect, encrypt, export, and manage local-first workspace files.',
      steps: Object.freeze([
        {
          selector: '#workspacesPanelTab',
          title: 'Open Workspaces',
          body: 'Workspaces separate saved API projects and their local workspace files.'
        },
        {
          selector: '#workspacesList',
          title: 'Select a workspace',
          body: 'The workspace list shows the current workspace and any other saved local workspaces.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#workspaceMainTitle',
          title: 'Review workspace identity',
          body: 'The workspace title and file path help confirm which local workspace is active.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#workspaceSummary',
          title: 'Read the summary',
          body: 'The summary reports saved collections, folders, requests, environments, runners, performance tests, and workspace encryption status.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#switchWorkspacePanelButton',
          title: 'Switch deliberately',
          body: 'Switch to this Workspace loads a different workspace after PostMeter handles unsaved changes.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#encryptWorkspacePanelButton:not([hidden]), #removeWorkspaceEncryptionPanelButton:not([hidden])',
          title: 'Protect sensitive workspaces',
          body: 'Encrypt Workspace saves plaintext workspaces encrypted at rest and removes old unencrypted backups. Decrypt Workspace appears for encrypted workspaces and is clickable after the workspace is unlocked. PostMeter does not store the key.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#exportWorkspacePanelButton',
          title: 'Export workspace definitions',
          body: 'Workspace export includes saved definitions but excludes profile settings, vaults, diagnostics, and local-only bindings. Encrypted workspaces export as encrypted files.',
          beforeStep: tutorialEnsureWorkspaceContext
        },
        {
          selector: '#deleteWorkspacePanelButton',
          title: 'Delete workspace',
          body: 'Delete is guarded and disabled when removal would leave no workspace to use.',
          beforeStep: tutorialEnsureWorkspaceContext
        }
      ])
    },
    {
      id: 'cookies-basics',
      title: 'Cookies',
      level: 'Intermediate',
      duration: '6 minutes',
      summary: 'Use request cookie jar settings and the cookie manager to inspect, filter, and clear stored cookies.',
      steps: Object.freeze([
        {
          selector: '#openCookiesButton',
          title: 'Open the cookie manager',
          body: 'The top-bar Cookies button opens the shared workspace cookie manager beside the active environment selector.'
        },
        {
          selector: '#cookiesDomainInput',
          title: 'Inspect a domain',
          body: 'Type a domain to add it to the manager when you need to inspect cookies before a request has been sent.',
          beforeStep: tutorialEnsureCookiesModal
        },
        {
          selector: '#cookiesAddDomainButton',
          title: 'Add a domain view',
          body: 'Add domain creates a visible domain section. For example, adding localhost lets you inspect and edit cookies for local API development.',
          beforeStep: tutorialEnsureCookieDomainInput
        },
        {
          selector: '.cookie-domain-section[data-cookie-domain="localhost"] .cookie-add-inline-button',
          title: 'Add a cookie',
          body: 'Add Cookie creates a cookie row for the selected domain and opens the Set-Cookie text editor for the new value.',
          beforeStep: tutorialEnsureLocalhostCookieDomain
        },
        {
          selector: '#cookieManagerCookieTextInput',
          title: 'Edit cookie text',
          body: 'The text field accepts Set-Cookie style text: name=value first, then attributes such as Path, Domain, Expires, Secure, HttpOnly, SameSite, Priority, Partitioned, and Enabled=false.',
          beforeStep: tutorialEnsureLocalhostCookieEditor
        },
        {
          selector: '.cookie-domain-section[data-cookie-domain="localhost"] .cookie-remove-button',
          title: 'Remove one cookie',
          body: 'The cookie remove button deletes only that individual cookie from the domain.',
          beforeStep: tutorialEnsureLocalhostCookieEditor
        },
        {
          selector: '.cookie-domain-section[data-cookie-domain="localhost"] .cookie-domain-remove-button',
          title: 'Remove the domain',
          body: 'The domain remove button removes the domain view and all cookies stored for that domain.',
          beforeStep: tutorialEnsureLocalhostCookieEditor
        },
        {
          selector: '#cookiesClearMenuButton',
          title: 'Open the Clear menu',
          body: 'Open Clear when you need bulk cleanup instead of removing a single cookie or one domain.',
          beforeStep: tutorialEnsureCookiesModal
        },
        {
          selector: '#clearExpiredWorkspaceCookiesButton',
          title: 'Clear expired cookies',
          body: 'Clear expired removes only cookies whose expiration time has passed.',
          beforeStep: tutorialEnsureCookiesClearMenu
        },
        {
          selector: '#clearAllWorkspaceCookiesButton',
          title: 'Clear all cookies',
          body: 'Clear all removes every workspace cookie after confirmation, so use it when you want a clean cookie jar.',
          beforeStep: tutorialEnsureCookiesClearMenu
        },
        {
          selector: '#requestSettingsTabButton',
          title: 'Open request Settings',
          body: 'Click the Settings tab in a request before reviewing request-specific cookie behavior.',
          beforeStep: () => tutorialEnsureCollectionRequestContext('params')
        },
        {
          selector: 'section[aria-labelledby="requestCookiesSettingsTitle"]',
          title: 'Review request cookie settings',
          body: 'The request Settings tab controls how this request uses the shared workspace cookie jar.',
          beforeStep: tutorialEnsureRequestCookieSettingsContext
        },
        {
          selector: '#requestSettingsTab label[title="Send matching cookies from the cookie jar with this request."]',
          title: 'Send stored cookies',
          body: 'Use cookie jar for this request sends matching cookies from the shared workspace cookie jar.',
          beforeStep: tutorialEnsureRequestCookieSettingsContext
        },
        {
          selector: '#requestSettingsTab label[title="Save Set-Cookie values from this response into the cookie jar."]',
          title: 'Store response cookies',
          body: 'Store response cookies saves Set-Cookie values from successful sends into the workspace cookie jar.',
          beforeStep: tutorialEnsureRequestCookieSettingsContext
        },
        {
          selector: '#requestSettingsTab label[title="Limit the cookie manager view to cookies matching the current request host."]',
          title: 'Filter to the active host',
          body: 'Active host only focuses the cookie manager on cookies that match the current request host.',
          beforeStep: tutorialEnsureRequestCookieSettingsContext
        },
        {
          selector: '#openRequestCookiesButton',
          title: 'Open Cookies from the request',
          body: 'Open Cookies brings you back to the same shared cookie manager while keeping the request Settings context visible.',
          beforeStep: tutorialEnsureRequestCookieSettingsContext
        }
      ])
    },
    {
      id: 'local-secrets-and-files',
      title: 'Vault, Packages, and Secrets',
      level: 'Advanced',
      duration: '6 minutes',
      summary: 'Review local-only vault secrets, reviewed script packages, and imported file bindings.',
      steps: Object.freeze([
        {
          title: 'Navigate to Settings',
          body: 'Open the desktop File menu from the app menu bar, and click the Settings button.',
          coachPlacement: 'top-left'
        },
        {
          selector: '#settingsVaultButton',
          title: 'Open Vault',
          body: 'Open Vault when you need to manage local secret bindings used by scripts through pm.vault.',
          beforeStep: tutorialEnsureSettingsModal
        },
        {
          selector: '#settingsVaultSection',
          title: 'Review Vault',
          body: 'The Vault panel shows local secret metadata, audit entries, and controls for binding or resetting workspace secrets. Secret values stay on this machine and are not exported.',
          beforeStep: () => tutorialEnsureSettingsSection('vault')
        },
        {
          selector: '#bindVaultSecretButton',
          title: 'Bind Vault Secret',
          body: 'Bind Vault Secret connects a workspace secret name to an encrypted local value on this machine.',
          beforeStep: () => tutorialEnsureSettingsSection('vault')
        },
        {
          selector: '#refreshVaultMetadataButton',
          title: 'Refresh Vault Metadata',
          body: 'Refresh Vault Metadata reloads local vault metadata so the panel reflects the latest bound secrets and audit history.',
          beforeStep: () => tutorialEnsureSettingsSection('vault')
        },
        {
          selector: '#resetVaultButton',
          title: 'Reset Vault',
          body: 'Reset Vault removes local vault contents for this workspace after confirmation. Use it when this machine should forget the saved secrets.',
          beforeStep: () => tutorialEnsureSettingsSection('vault')
        },
        {
          selector: '#settingsPackagesButton',
          title: 'Open Packages',
          body: 'Open Packages to manage reviewed JavaScript bundles that scripts can require without fetching code during execution.',
          beforeStep: tutorialEnsureSettingsModal
        },
        {
          selector: '#settingsPackagesSection',
          title: 'Review Packages',
          body: 'The Packages panel shows missing reviewed packages, cached packages, and controls for adding or fetching packages for local review.',
          beforeStep: () => tutorialEnsureSettingsSection('packages')
        },
        {
          selector: '#addSandboxPackageButton',
          title: 'Add Reviewed Package',
          body: 'Add Reviewed Package records a package specifier that has already been reviewed and is available for trusted script use.',
          beforeStep: () => tutorialEnsureSettingsSection('packages')
        },
        {
          selector: '#fetchSandboxPackageButton',
          title: 'Fetch Package for Review',
          body: 'Fetch Package for Review downloads package contents from an allowed source so you can inspect and cache the exact bundle locally.',
          beforeStep: () => tutorialEnsureSettingsSection('packages')
        },
        {
          selector: '#refreshSandboxPackagesButton',
          title: 'Refresh Package Status',
          body: 'Refresh Package Status rescans script package references and updates which packages are missing or cached.',
          beforeStep: () => tutorialEnsureSettingsSection('packages')
        },
        {
          selector: '#settingsFilesButton',
          title: 'Open Files',
          body: 'Open Files to bind imported file references to real local files on this machine.',
          beforeStep: tutorialEnsureSettingsModal
        },
        {
          selector: '#settingsFilesSection',
          title: 'Review Files',
          body: 'The Files panel shows imported file references, local binding status, and controls for connecting those references to real files.',
          beforeStep: () => tutorialEnsureSettingsSection('files')
        },
        {
          selector: '#bindSandboxFileButton',
          title: 'Bind Imported File',
          body: 'Bind Imported File maps an imported file reference to a local file path while keeping that local path out of workspace exports.',
          beforeStep: () => tutorialEnsureSettingsSection('files')
        },
        {
          selector: '#refreshSandboxFilesButton',
          title: 'Refresh File Bindings',
          body: 'Refresh File Bindings rescans imported file references and updates which references still need local paths.',
          beforeStep: () => tutorialEnsureSettingsSection('files')
        }
      ])
    },
    {
      id: 'ssl-certificates',
      title: 'SSL Certificates',
      level: 'Advanced',
      duration: '6 minutes',
      summary: 'Configure SSL verification, trusted CA files, client certificates, request-level TLS settings, and TLS response evidence.',
      steps: Object.freeze([
        {
          title: 'Navigate to Settings',
          body: 'Open the desktop File menu from the app menu bar, and click the Settings button.',
          coachPlacement: 'top-left'
        },
        {
          selector: '#settingsCertificatesButton',
          title: 'Open Certificates',
          body: 'Open the Certificates tab to manage workspace-local trust choices for HTTPS requests.',
          beforeStep: tutorialEnsureSettingsModal
        },
        {
          selector: '#sslCertificateVerificationField',
          title: 'Verify SSL certificates',
          body: 'Keep SSL certificate verification on for normal work. Turning it off allows connections with untrusted or invalid server certificates and should be deliberate.',
          beforeStep: () => tutorialEnsureSettingsSection('certificates')
        },
        {
          selector: '#caCertificatePathInput',
          title: 'Trust a custom CA',
          body: 'CA PEM file points PostMeter at a local certificate authority bundle for private PKI, internal gateways, or development certificates.',
          beforeStep: () => tutorialEnsureSettingsSection('certificates')
        },
        {
          selector: '#chooseCaCertificateButton',
          title: 'Choose or clear the CA file',
          body: 'Choose opens a local file picker for the CA PEM path. Clear removes the custom CA path and returns to the default trust store.',
          beforeStep: () => tutorialEnsureSettingsSection('certificates')
        },
        {
          selector: '#addClientCertificateButton',
          title: 'Add client certificates',
          body: 'Client certificates are reusable mTLS definitions. The editor captures the display name, host match, optional port, PEM certificate and key files or a PFX/P12 bundle, optional passphrase, and enabled state.',
          beforeStep: () => tutorialEnsureSettingsSection('certificates')
        },
        {
          selector: '#clientCertificateNameInput',
          title: 'Name the certificate',
          body: 'Name gives the client certificate a readable label so it is easy to identify in the settings list and TLS diagnostics.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#clientCertificateHostInput',
          title: 'Match host and port',
          body: 'Host decides which HTTPS hosts can use this client certificate. Port is optional and narrows the match when the same host uses different mTLS identities.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#clientCertificateFormatSelect',
          title: 'Choose certificate format',
          body: 'Format switches between separate PEM certificate/key files and a single PFX or P12 bundle.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#clientCertificateCertPathInput',
          title: 'Use the PEM CRT file',
          body: 'For PEM format, the CRT file contains the client certificate PostMeter presents to matching HTTPS hosts.',
          beforeStep: () => tutorialEnsureClientCertificateModalFormat('pem')
        },
        {
          selector: '#clientCertificateKeyPathInput',
          title: 'Use the PEM KEY file',
          body: 'The KEY file contains the private key for the PEM client certificate. The path stays local to this machine and is not written into shared exports.',
          beforeStep: () => tutorialEnsureClientCertificateModalFormat('pem')
        },
        {
          selector: '#clientCertificatePfxPathInput',
          title: 'Use a PFX or P12 bundle',
          body: 'For PFX/P12 format, provide the bundle file instead of separate CRT and KEY files.',
          beforeStep: () => tutorialEnsureClientCertificateModalFormat('pfx')
        },
        {
          selector: '#clientCertificatePassphraseInput',
          title: 'Store the passphrase locally',
          body: 'Passphrase is optional and saved as a local secret when present, so exports do not include the plaintext value.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#clientCertificateEnabledField',
          title: 'Enable the certificate',
          body: 'Enable certificate controls whether PostMeter considers this client certificate when a request host matches.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#saveClientCertificateModalButton',
          title: 'Save the certificate',
          body: 'Save Certificate validates the host match and local file fields before adding the definition to the workspace settings.',
          beforeStep: tutorialEnsureClientCertificateModal
        },
        {
          selector: '#clientCertificateList',
          title: 'Review certificate matches',
          body: 'The client certificate list shows configured host matches and lets you enable, disable, edit, or remove saved certificates.',
          beforeStep: () => tutorialEnsureSettingsSection('certificates')
        },
        {
          selector: '#requestSettingsTabButton',
          title: 'Open request TLS settings',
          body: 'Individual requests can override certificate verification from the request Settings tab.',
          beforeStep: tutorialEnsureRequestCertificateSettingsContext
        },
        {
          selector: '#requestSslCertificateVerificationField',
          title: 'Override verification per request',
          body: 'This request-level certificate setting lets a specific request inherit, enable, or disable SSL verification without changing the workspace default.',
          beforeStep: tutorialEnsureRequestCertificateSettingsContext
        },
        {
          selector: '#resultsNetworkTabButton',
          title: 'Inspect TLS evidence',
          body: 'After a send, Network response evidence can include TLS authorization status, certificate subject and issuer, validity dates, fingerprint, protocol, cipher, and timing details.',
          beforeStep: () => tutorialEnsureRequestResultsContext('responseNetwork')
        }
      ])
    }
  ]);


  return TUTORIALS;
  }

  const exported = {
    createTutorials
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterTutorialCatalog = exported;
})(typeof window === 'undefined' ? globalThis : window);
