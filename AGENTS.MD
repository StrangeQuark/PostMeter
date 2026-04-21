# AGENTS.md

## Purpose
This repository is maintained with the help of coding agents. Follow these instructions before making any change.

## Primary Goals
1. Produce production-grade, maintainable code.
2. Preserve correctness, readability, security, and operational safety.
3. Minimize unnecessary changes.
4. Prefer small, reviewable diffs over large refactors unless explicitly requested.

## Global Working Rules
- Read the relevant code paths before editing.
- Understand the request, affected components, and likely side effects before making changes.
- Do not guess about architecture when the code already answers the question.
- Do not introduce unrelated refactors.
- Do not rename files, symbols, or modules unless required by the task.
- Keep changes local and minimal unless the prompt explicitly asks for broader redesign.

## Decision-Making Standard
When several valid solutions exist, prefer this order:
1. Correctness
2. Security
3. Simplicity
4. Maintainability
5. Performance
6. Developer convenience

## Planning
For non-trivial work, do the following before editing:
1. Summarize the problem briefly.
2. Identify the files and systems likely affected.
3. State the intended approach.
4. Call out risks, assumptions, and dependencies.

If the task is large, split it into phases and complete the highest-confidence path first.

## Agent Roles
When explicitly asked to use multiple agents, use this default team structure:

### Lead Agent
Responsibilities:
- Understand the request
- Create the execution plan
- Delegate work
- Consolidate results
- Perform final review

### Backend Agent
Responsibilities:
- Service logic
- APIs
- database access
- schema changes
- validation
- authentication/authorization
- performance-sensitive server code

### Frontend Agent
Responsibilities:
- UI components
- state management
- API integration
- accessibility
- client-side validation
- responsive behavior

### Test Agent
Responsibilities:
- Unit tests
- integration tests
- regression checks
- fixtures/mocks
- ensuring changed behavior is covered

### Reviewer Agent
Responsibilities:
- Review diffs for correctness, security, maintainability, and edge cases
- Identify missing tests
- Identify risky assumptions
- Verify the implementation matches the request

## Multi-Agent Rules
- Do not spawn subagents unless explicitly requested by the user or task.
- If subagents are used, assign clear ownership boundaries.
- Avoid overlapping edits to the same files when possible.
- Merge results only after resolving conflicts and checking consistency.
- The Lead Agent is responsible for the final integrated answer.

## Code Change Rules
- Preserve existing public behavior unless the task requires behavior changes.
- Preserve backward compatibility unless explicitly told otherwise.
- Keep APIs stable where possible.
- If a breaking change is necessary, clearly note it.
- Do not hardcode secrets, tokens, credentials, or environment-specific values.
- Do not silently remove logging, metrics, tracing, or error handling without reason.

## Security Requirements
- Treat all external input as untrusted.
- Validate and sanitize inputs at system boundaries.
- Use least-privilege principles.
- Do not expose secrets in logs, tests, comments, or examples.
- Flag auth, crypto, permission, data exposure, and injection risks explicitly.
- Prefer secure defaults over permissive behavior.

## Data and Database Changes
- Any schema or migration change must include:
  - why it is needed
  - backward-compatibility impact
  - rollout considerations
  - rollback considerations
- Do not destroy or rewrite production data without explicit instruction.

## Testing Requirements
For any non-trivial code change:
- Add or update tests for the changed behavior.
- Run the narrowest relevant tests first, then broader checks as needed.
- If tests cannot be run, say so clearly and explain why.
- Do not claim code is verified unless verification was actually performed.

## Performance Requirements
- Avoid unnecessary allocations, repeated queries, N+1 patterns, and blocking work in hot paths.
- Do not optimize speculatively.
- If performance is part of the request, explain the bottleneck and the reason for the chosen fix.

## Observability
- Preserve useful logs, metrics, and traces.
- Add instrumentation when introducing new critical paths if the codebase already follows that pattern.
- Avoid noisy logging in hot paths.

## Documentation Requirements
Update documentation when relevant, including:
- setup steps
- API contracts
- env vars
- migrations
- operational behavior
- architectural decisions when they materially change

## Definition of Done
A task is done only when all applicable items are satisfied:
- the request is implemented
- the code is coherent with repository patterns
- tests were added or updated where appropriate
- verification was run where possible
- risks and assumptions are stated
- no unrelated changes were introduced

## Response Format
When completing work, respond with:
1. What changed
2. Why it changed
3. Files touched
4. Risks or follow-ups
5. Verification performed

## Forbidden Behavior
- Do not fabricate test results.
- Do not claim a bug is fixed without explaining the actual fix.
- Do not ignore failing checks.
- Do not overwrite user work without reason.
- Do not make large speculative architecture changes unless explicitly requested.

## Preferred Behavior for Ambiguous Requests
- First, infer the most likely intent from the codebase and prompt.
- Second, choose the smallest safe implementation that satisfies the request.
- Third, clearly note assumptions in the final response.

## Repository-Specific Section
Replace this section with project-specific details such as:
- architecture overview
- important directories
- build commands
- test commands
- lint commands
- local run commands
- deployment constraints
- service boundaries
- coding conventions