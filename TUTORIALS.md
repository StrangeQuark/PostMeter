# PostMeter Tutorials Implementation Notes

This file is an implementation handoff for future tutorial expansion. It is intentionally technical and should be updated whenever the Tutorials system changes.

## Current Feature Surface

- Entry point: `Help > Tutorials`.
- Current tutorials:
  - `request`: Request.
  - `environment-variables`: Environment Variables.
  - `runner`: Runner.
  - `performance`: Performance Test.
  - `workspaces-basics`: Workspaces.
  - `cookies-basics`: Cookies.
  - `local-secrets-and-files`: Vault, Packages, and Secrets.
  - `ssl-certificates`: SSL Certificates.
- CSV variable and refreshing auth guidance is folded into the Runner and Performance Test tutorials rather than exposed as standalone tutorials.
- Tutorials are renderer-only guidance. They are not persisted to workspace JSON, settings JSON, session JSON, or run exports.
- Tutorial steps may create unsaved draft objects so the user can inspect real UI controls without preparing fixture data.

## Files

- `electron/appMenu.js`
  - Adds `actionItem('Tutorials', 'tutorials')` to the Help menu.
- `electron/mainWindow.js`
  - Keeps the UI workflow smoke title watcher long enough for the full tutorial catalog walkthrough.
- `electron/preload.js`
  - Allows the `tutorials` menu action through `app.onMenuAction`.
- `src/renderer/index.html`
  - Adds `#tutorialsModal` inside `#modalBackdrop`.
  - Adds `#tutorialOverlay`, `#tutorialTargetFrame`, and `#tutorialCoach` outside the modal backdrop.
- `src/renderer/overlays.css`
  - Styles the tutorials modal, tutorial list/detail layout, target frame, overlay dimming, coach panel, and mobile fallback.
  - Constrains the tutorial modal to the viewport and lets the tutorial list/detail panes scroll on small app screens.
  - Keeps the tutorial overlay above modal dialogs so modal-owned steps can highlight real controls.
- `src/renderer/rendererBootstrap.js`
  - Binds close/start/back/next/end controls to renderer callbacks.
- `src/renderer/renderer.js`
  - Owns the tutorial definitions, modal rendering, active tutorial state, step navigation, overlay positioning, and context setup helpers.
- `src/renderer/uiWorkflowSmoke.js`
  - E2E coverage for every tutorial entry. Opens the modal, selects each tutorial, starts it, navigates every step, verifies the highlighted target is visible, and finishes.
- `test/electron/uiWorkflowSmoke.js`
  - Sets the outer Electron process timeout for the expanded workflow smoke.
- `test/electron/appMenu.test.js`
  - Verifies Help > Tutorials dispatches `tutorials`.
- `test/electron/preloadMenuActions.test.js`
  - Verifies `tutorials` is allowed through preload.
- `test/electron/rendererBootstrap.test.js`
  - Verifies tutorial modal and overlay controls are wired.

## Menu And IPC Flow

```text
Help > Tutorials
  -> electron/appMenu.js sendMenuAction('tutorials')
  -> electron/preload.js app.onMenuAction allowlist
  -> src/renderer/renderer.js handleAppMenuAction('tutorials')
  -> openTutorialsModal()
```

No main-process handler is needed beyond the existing menu event relay. Tutorials do not cross renderer-to-main IPC.

## DOM Contract

Modal IDs:

```text
#tutorialsModal
#tutorialsModalTitle
#closeTutorialsModalButton
#tutorialList
#tutorialDetailLevel
#tutorialDetailTitle
#tutorialDetailSummary
#tutorialDetailSteps
#startTutorialButton
```

Overlay IDs:

```text
#tutorialOverlay
#tutorialTargetFrame
#tutorialCoach
#tutorialCoachProgress
#tutorialCoachTitle
#tutorialCoachBody
#tutorialCoachHint
#endTutorialButton
#previousTutorialStepButton
#nextTutorialStepButton
```

The smoke tests depend on `#tutorialList`, `.tutorial-list-item`, `#tutorialDetailTitle`, `#tutorialDetailSteps`, `#tutorialOverlay`, `#tutorialTargetFrame`, `#tutorialCoachTitle`, `#tutorialCoachProgress`, and `#endTutorialButton`.

## Renderer State

Current tutorial state in `renderer.js`:

```js
let selectedTutorialId = TUTORIALS[0]?.id || '';
let activeTutorialId = '';
let activeTutorialStepIndex = 0;
let tutorialOverlayPositionHandler = null;
let tutorialOwnedModalId = '';
```

These values are intentionally not part of `rendererState.js` or session persistence. Closing/reloading the app resets tutorial state.

## Tutorial Definition Schema

Tutorials are static objects in the `TUTORIALS` array in `src/renderer/renderer.js`.

```js
{
  id: 'stable-id',
  title: 'Human title',
  level: 'Beginner',
  duration: '2 minutes',
  summary: 'Short modal detail copy.',
  steps: Object.freeze([
    {
      selector: '#stableDomTarget',
      title: 'Step title',
      body: 'Coach body copy.',
      hint: 'Optional muted helper copy.',
      beforeStep: optionalFunction
    }
  ])
}
```

Required fields:

- `id`: stable unique key. Use kebab-case.
- `title`: modal list and detail title.
- `level`: short category label.
- `duration`: short expected duration label.
- `summary`: modal detail copy.
- `steps`: ordered step list.
- `step.selector`: CSS selector for the DOM target to highlight.
- `step.title`: coach heading.
- `step.body`: coach body.

Optional fields:

- `step.hint`: secondary coach text.
- `step.beforeStep`: idempotent function called before the step renders.
- `step.scroll`: set to `false` when the target is already visible and auto-scrolling would move an internal panel to an awkward position.
- `step.coachPlacement`: optional placement for coach-only steps. Use `top-left` when a step intentionally has no selector and should sit under the app menu area.

## Current Step Setup Helpers

`tutorialEnsureRequestContext(tabName = 'params')`

- Creates a draft request when no normal request is active.
- Avoids runner-owned and auth-refresh-owned request tabs.
- Switches to Collections/request mode and activates the requested request tab.
- Does not save the draft request.

`tutorialEnsureEnvironmentContext()`

- Selects an existing environment if one exists.
- Creates an unsaved environment when needed.
- Switches to Environments mode and opens the environment tab.
- Does not save the environment.

`tutorialEnsureRunnerContext()`

- Selects an existing runner if one exists.
- Creates an unsaved runner when needed.
- Switches to Runners mode and opens the runner tab.
- Does not save the runner.

Additional tutorial helpers now cover the expanded catalog:

- `tutorialEnsureCollectionRequestContext(tabName = 'params')`
  - Opens a normal collection request context for request, cookie, and SSL certificate tutorials.
  - Creates an unsaved collection/request only when needed.
- `tutorialEnsureDraftRequestContext(tabName = 'params')`
  - Opens an unsaved draft request when the tutorial needs to safely mutate controls such as OAuth fields.
- `tutorialEnsureRawRequestBodyContext()`
  - Opens the Body tab and prepares a raw JSON request body so raw-format controls are visible.
- `tutorialEnsureRequestSettingsOverviewContext()`
  - Opens the request Settings tab and resets that tab panel to the top before highlighting the visible settings pane.
- `tutorialEnsureRequestResultsContext(tabName = 'response')`
  - Opens a collection request context and activates the requested response evidence tab.
- `tutorialEnsurePerformanceContext()`
  - Selects or creates an unsaved performance test and opens the Performance panel.
- `tutorialEnsurePerformanceRequestContext(tabName)` and `tutorialEnsurePerformanceTypeContext(type)`
  - Open performance request tabs and performance mode panels.
- `tutorialEnsureRunnerCaptureSettings()`, `tutorialEnsurePerformanceCaptureSettings()`, `tutorialEnsureRunnerAdvancedSettings()`, and `tutorialEnsurePerformanceAdvancedSettings()`
  - Open floating panels idempotently while tutorial coach clicks are exempt from outside-click dismissal.
- `tutorialEnsureToolbarMenu(buttonId, menuId)`
  - Opens toolbar menus idempotently for tutorial-owned toolbar menu steps.
- `tutorialEnsureRunnerCsvVariablesModal()`, `tutorialEnsureCookiesModal()`, `tutorialEnsureSettingsModal()`, and `tutorialEnsureSettingsSection(section)`
  - Open tutorial-owned modals and close them automatically when the tutorial ends.
- `tutorialEnsureCookieDomainInput()`, `tutorialEnsureLocalhostCookieDomain()`, `tutorialEnsureLocalhostCookieEditor()`, `tutorialEnsureCookiesClearMenu()`, and `tutorialEnsureRequestCookieSettingsContext()`
  - Set up the Cookies tutorial with a localhost domain, sample cookie editor, open Clear menu, and request Settings cookie controls.
- `tutorialEnsureAuthRefreshPanel(prefix)`, `tutorialEnsureAuthRefreshManageMenu(prefix)`, `tutorialEnsureAuthRefreshDetails(prefix, section)`, and `tutorialEnsureAuthRefreshAutoDetectExample(prefix)`
  - Open refreshing-auth panels, request action menus, details sections, and a tutorial-owned mock Auto-Detect modal.
- `tutorialEnsureClientCertificateModal()` and `tutorialEnsureClientCertificateModalFormat(format)`
  - Open the client certificate editor from Settings and expose PEM/PFX-specific controls for the SSL Certificates tutorial.
- `tutorialEnsureRequestCertificateSettingsContext()`
  - Closes the tutorial-owned Settings modal and opens the request Settings tab for request-level SSL certificate controls.
Future helpers should follow the same rule: create the smallest unsaved context needed to show real controls and avoid writing to disk.

## Runtime Lifecycle

Important functions in `renderer.js`:

```text
openTutorialsModalSafely()
openTutorialsModal()
renderTutorialsModal()
selectTutorial(tutorialId)
startSelectedTutorial()
startTutorial(tutorialId)
previousTutorialStep()
nextTutorialStep()
endTutorial(options)
showTutorialStep(index)
tutorialById(tutorialId)
activeTutorial()
tutorialTargetElement(step)
attachTutorialOverlayListeners()
detachTutorialOverlayListeners()
positionTutorialOverlay()
visibleTutorialTargetRect(target)
positionTutorialFrame(frame, rect)
positionTutorialCoach(coach, targetRect)
clampNumber(value, min, max)
```

Start behavior:

```text
startSelectedTutorial()
  -> resolveActiveModal(null, { flushNotifications: false })
  -> startTutorial(selectedTutorialId)
  -> endTutorial({ silent: true })
  -> set activeTutorialId/activeTutorialStepIndex
  -> attach resize/scroll listeners
  -> showTutorialStep(0)
```

Step behavior:

```text
showTutorialStep(index)
  -> clamp requested index
  -> call step.beforeStep()
  -> unhide #tutorialOverlay
  -> update coach progress/title/body/hint/buttons
  -> scroll target into view
  -> requestAnimationFrame(positionTutorialOverlay)
```

End behavior:

```text
endTutorial()
  -> close tutorial-owned modal, toolbar menus, and floating settings panels
  -> hide overlay and target frame
  -> remove resize/scroll listeners
  -> reset active tutorial id/index
```

## Overlay Positioning

- `#tutorialTargetFrame` is fixed-positioned around the target's `getBoundingClientRect()` plus padding.
- Target rectangles are clipped to the viewport and scrollable/hidden ancestor bounds, so highlights do not frame content hidden outside a pane.
- `box-shadow: 0 0 0 9999px ...` creates the dimmed page outside the target.
- `#tutorialOverlay` has `pointer-events: none`.
- `#tutorialCoach` has `pointer-events: auto`, so coach buttons remain clickable.
- The tutorial overlay is intentionally above modal dialogs so tutorials can highlight CSV, Cookies, and Settings modal controls.
- Step transitions hide and reposition the frame before showing it, avoiding stale frame animation between distant targets.
- Coach placement preference:
  - right of target
  - left of target
  - below target
  - above target
  - centered if no visible target
- Resize and document scroll listeners reposition the overlay while active.

## Test Contract

Run after tutorial edits:

```bash
node --check src/renderer/renderer.js
node --test test/electron/appMenu.test.js test/electron/preloadMenuActions.test.js test/electron/rendererBootstrap.test.js
npm run test:ui
npm run test:ui:regression
npm run test:ui:typography
npm run test:ui:snapshot
git diff --check
```

Use `npm test` for broader regression coverage when touching menu/preload/bootstrap or shared renderer behavior.

Current E2E assertions in `uiWorkflowSmoke.js`:

- `window.PostMeterTutorials` exists.
- Tutorials modal opens.
- The full first-class tutorial catalog renders.
- Each tutorial row can be selected from the modal.
- Each detail pane renders exactly the tutorial's step list.
- The modal exposes scrolling when the catalog or selected tutorial is taller than the available app screen.
- Starting each tutorial closes the Tutorials modal and shows `#tutorialOverlay`.
- Every step renders the expected progress/title and highlights a visible target frame.
- Finishing each tutorial hides the overlay before the next tutorial starts.

## Future Expansion Rules

- Prefer adding tutorial objects to `TUTORIALS` before changing lifecycle code.
- Keep tutorial IDs stable once released.
- Use stable DOM IDs for `step.selector`; avoid selectors based on incidental layout or text.
- Keep `beforeStep` functions idempotent. Back/Next may call them more than once.
- Do not save workspace data from tutorial setup helpers.
- Do not run network requests automatically from tutorial setup helpers.
- Keep first steps non-mutating when practical so smoke tests can open and start the default tutorial without disturbing later workflow state.
- Update `uiWorkflowSmoke.js` when adding first-class tutorials that must be guaranteed in the app.
- Update this file when new lifecycle concepts are added, such as completion state, branching, media, clickable target auto-advance, or extracted `rendererTutorials.js`.

## Known Limitations

- Tutorial logic currently lives in `renderer.js`. If the tutorial catalog grows substantially, extract it to a renderer-owned module before adding many advanced flows.
- There is no completion tracking, search, categorization, or versioning.
- There is no branching or conditional step resolution.
- The overlay highlights one target at a time.
- The target itself is not made clickable through the overlay; users advance with coach controls.
- Tutorial copy is static and not localized.
