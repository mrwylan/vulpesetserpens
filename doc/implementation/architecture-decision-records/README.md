# Architecture Decision Records (ADRs)

This folder documents every significant technical decision made during the design and implementation of this project. ADRs are binding guidance — the implementation must follow them unless a superseding ADR is added.

## Purpose

ADRs answer "why did we build it this way?" They prevent:
- Re-litigating settled decisions in every coding session
- Inconsistent choices across features (e.g., mixing different state management approaches)
- Loss of context when a new agent or contributor picks up the project

## Conventions

- One file per decision
- File names use a zero-padded sequence number and a short slug: `adr-001-frontend-framework.md`, `adr-002-audio-processing-strategy.md`, etc.
- Status field must be one of: `Proposed` | `Accepted` | `Deprecated` | `Superseded by ADR-XXX`
- Once `Accepted`, an ADR must not be silently changed — add a new ADR that supersedes it

## ADR Template

```
# ADR-XXX — <Decision Title>

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
Why does this decision need to be made? What forces are at play?

## Decision
What was decided, stated clearly.

## Rationale
Why this option over the alternatives? What trade-offs were accepted?

## Alternatives Considered
Brief notes on what was rejected and why.

## Consequences
What does this decision constrain or enable going forward?
```
