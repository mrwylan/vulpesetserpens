---
name: tdd-workflow
description: Enforce Red-Green-Refactor TDD cycle for every feature implementation. Use this skill when implementing any use case or function covered by ADR-007.
argument-hint: "<UC-ID or function name to implement>"
---

# TDD Workflow — Red-Green-Refactor

Follow this cycle strictly for every feature. Do not write implementation code before a failing test exists.

## Step 1 — RED: write a failing test first

1. Read the use case document for the feature (`doc/implementation/system-use-cases/uc-*.md`)
2. Identify the acceptance criteria and their assigned test layer (Unit or E2E) from the `## Test Coverage` section
3. Write the test(s) **before any implementation code**:
   - Unit tests go in a `.test.ts` file co-located with the source file (e.g. `src/audio/encodeWav.test.ts`)
   - E2E tests go in `tests/e2e/uc-XXX-*.spec.ts`
4. Run the tests and confirm they **fail** for the right reason (function not found, assertion fails — not a syntax error)
   ```sh
   npm run test:unit   # for unit tests
   npm run test:e2e    # for E2E tests
   ```

## Step 2 — GREEN: write the minimum implementation to pass

1. Write only enough code to make the failing tests pass
2. Do not add features, error handling, or optimisations not required by the failing test
3. Run the tests again — all must pass before proceeding

## Step 3 — REFACTOR: clean up without breaking

1. Improve the implementation (naming, structure, edge cases) while keeping tests green
2. Ensure TypeScript strict mode has no errors (`npm run build`)
3. Verify unit coverage on `src/audio/` has not dropped below 80%

## Step 4 — confirm done

A feature is complete when:
- [ ] All acceptance criteria from the UC have a passing test
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes with no TypeScript errors
- [ ] No `any` types introduced without a comment

## Layer assignment reminder

| Test layer | Tool | Scope |
|-----------|------|-------|
| Unit | Vitest (co-located `.test.ts`) | Pure functions in `src/audio/` — no DOM, no AudioContext |
| E2E | Playwright (`tests/e2e/`) | Browser flows — upload, canvas, playback, download |

**Never use jsdom to test Web Audio API or Canvas behaviour.** If a test needs AudioContext, it is an E2E test.
