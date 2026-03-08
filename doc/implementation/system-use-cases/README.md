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

## Notes / Constraints
Technical constraints, performance requirements, or implementation hints.
```
