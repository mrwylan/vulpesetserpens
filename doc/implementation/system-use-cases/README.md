# System Use Cases

This folder contains implementation-level use case documents. Each file describes a discrete feature or capability of the application in enough detail for a coding agent to implement it correctly and completely.

## Index

| ID | Title | Status |
|----|-------|--------|
| UC-001 | Upload Audio File | Accepted |
| UC-002 | Visualize Waveform | Accepted |
| UC-003 | Detect Loop Candidates | Accepted |
| UC-004 | Audition Loop | Accepted |
| UC-005 | Export Loop | Accepted |
| UC-006 | Set Tempo Reference | Accepted |
| UC-007 | Adjust Loop Points Manually | Accepted |
| UC-008 | Select Creator Profile | Accepted |
| UC-009 | Batch Export Loop Candidates | Draft |

## Purpose

Use case documents bridge the business goals (see `doc/business/`) and the actual code. They answer:
- What triggers this feature?
- What does the system do, step by step?
- What are the success and failure conditions?
- What constraints or edge cases must the implementation handle?

## Conventions

- One file per use case
- File names use kebab-case and reflect the use case action: `uc-upload-audio-file.md`, `uc-detect-loop-candidates.md`, etc.
- Each document follows the structure below

## Definition of Done

A use case is **not complete** until every item below is satisfied:

1. The feature works correctly in the browser
2. Every acceptance criterion in the use case document has a corresponding passing automated test
3. Unit tests cover pure functions (`src/audio/`) — see ADR-007 for the 80% threshold
4. E2E tests (Playwright) cover the primary user flow and at least one failure/error case
5. The CI pipeline passes on the implementing branch

Acceptance criteria are the contract between the use case document and the test suite. If a criterion cannot be tested, it must be rewritten until it can.

## Test Coverage Reference

| Layer | Tool | Scope | Enforced by |
|-------|------|-------|-------------|
| Unit | Vitest | Pure functions in `src/audio/` | Husky pre-push + CI |
| E2E | Playwright | Full user flows, all UC acceptance criteria | CI |

See ADR-007 for the full testing strategy, fixture conventions, and CI pipeline specification.

## Use Case Template

```
# UC-XXX — <Short Title>

## Trigger
What initiates this use case (user action, system event, etc.)

## Preconditions
What must be true before this use case can run.

## Main Flow
Numbered steps describing the happy path.

## Alternate Flows
Named sub-sections for variations or branches.

## Failure / Error Cases
What can go wrong and how the system should respond.

## Acceptance Criteria
Testable statements that define "done".
Each criterion must be automatable — if it cannot be expressed as a Vitest or Playwright assertion, rewrite it.

## Test Coverage
Which test layer covers each acceptance criterion:
- Unit (Vitest): list criteria covered by unit tests
- E2E (Playwright): list criteria covered by E2E tests

## Notes / Constraints
Technical constraints, performance requirements, or implementation hints.
```
