# ADR-009 — Dependency Management Policy

**Date:** 2026-03-08
**Status:** Accepted

---

## Context

After the initial implementation, `npm outdated` reveals several packages that have released major versions since the project was bootstrapped:

| Package | Installed | Latest | Kind |
|---------|-----------|--------|------|
| `react` / `react-dom` | 18.3.1 | 19.x | Runtime — major |
| `vite` | 6.x | 7.x | Build tool — major |
| `vitest` / `@vitest/coverage-v8` | 3.x | 4.x | Test runner — major |
| `@vitejs/plugin-react` | 4.x | 5.x | Vite plugin — major |
| `typescript` | 5.6 | 5.9 | Compiler — minor |
| `@types/react` / `@types/react-dom` | 18.x | 19.x | Types — major |
| Node.js base image (`node:20-alpine`) | LTS 20 | LTS 22 | Runtime — major |

GitHub Actions versions (`actions/checkout`, `docker/build-push-action`, etc.) are a separate dependency surface. They follow the same drift risk: pinning to a major tag (`@v4`) silently receives no updates to newer majors, and security advisories are issued against action versions just as they are for npm packages.

Stale major versions produce deprecation warnings in `npm install` output, in CI logs, and occasionally in `npm run build`. They accumulate security surface over time and make future major upgrades harder (multiple versions of drift compound breaking changes).

`npm audit` currently reports **0 vulnerabilities**. The risk today is low, but the pattern of ignoring outdated dependencies leads to progressively harder upgrades and surprise breakage when a transitive dependency drops support for an old major.

---

## Decision

### 1. Update gate before new features

No new feature branch may be started if any direct dependency has a **security advisory at severity ≥ high** (`npm audit --audit-level=high` exits non-zero). Minor/patch updates are desirable but not blocking. Major version updates require a dedicated update PR (see below).

### 2. Dedicated dependency update PRs

Dependency updates are always done in isolation — never mixed with feature or fix commits. A dependency PR must:

1. Run `npm outdated` and update all direct dependencies to their latest stable version
2. Pass `npm run test:unit` and `npm run test:e2e` with no regressions
3. Pass `npm run build` cleanly (zero warnings treated as errors)
4. Update `Dockerfile` if the Node.js base image changes

One PR per update batch. Never bundle a dependency bump with a feature change.

### 3. Scheduled update cadence

| Trigger | Action |
|---------|--------|
| Before every new feature branch | Run `npm audit --audit-level=high`; block on failures |
| Monthly (or per Dependabot PR) | Review `npm outdated`; batch patch/minor updates |
| Quarterly | Evaluate major version upgrades; plan migration if breaking changes exist |
| Node.js LTS release | Update `FROM node:XX-alpine` in `Dockerfile` within one month |

### 4. Automated PR creation via Dependabot

A Dependabot configuration is added to the repository to automate PR creation for outdated dependencies. Dependabot runs weekly. PRs are reviewed like any other code change — they must pass CI before merge.

Three dependency surfaces are tracked:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm        # package.json dependencies
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      vitest:
        patterns: ["vitest", "@vitest/*"]
      vite:
        patterns: ["vite", "@vitejs/*"]
      typescript:
        patterns: ["typescript", "@types/*"]

  - package-ecosystem: docker     # Dockerfile base images
    directory: /
    schedule:
      interval: weekly
      day: monday

  - package-ecosystem: github-actions   # .github/workflows action versions
    directory: /
    schedule:
      interval: weekly
      day: monday
```

Grouping related packages (e.g., all `@vitest/*` together) avoids fragmented PRs for ecosystems that must be updated in lockstep. GitHub Actions are tracked individually since they rarely require lockstep updates.

### 5. Major version upgrade process

Major versions (React 18 → 19, Vite 6 → 7, Vitest 3 → 4) require a structured approach:

1. **Read the migration guide** before touching `package.json`
2. **Update one ecosystem at a time** — do not upgrade React and Vite in the same PR
3. **Run the full test suite** (`test:unit` + `test:e2e`) after each ecosystem upgrade
4. **Fix any TypeScript errors** introduced by the upgrade before committing
5. **Update this ADR** with the new installed versions once the upgrade lands

### 6. Node.js version alignment

The Node.js version in `Dockerfile` (`FROM node:XX-alpine`) and in `.github/workflows` (`node-version: 'XX'`) must always match and must track the **current Active LTS** release. When Node.js LTS changes:

- Update `Dockerfile` base image
- Update all `node-version` entries in workflow files
- Run `npm run build` and `npm run test:unit` to confirm compatibility

Current target: **Node.js 22** (Active LTS as of late 2025). Migration from 20 → 22 is the first task under this policy.

---

## Immediate action items

These items are due before the next feature work begins:

| Item | Command |
|------|---------|
| Add `.github/dependabot.yml` | (create file per spec above) |
| Upgrade Node.js base image | `FROM node:20-alpine` → `FROM node:22-alpine` |
| Upgrade TypeScript | `~5.6.2` → `~5.9.x` |
| Evaluate React 19, Vite 7, Vitest 4 | Read migration guides, create separate upgrade PRs |

---

## Alternatives Considered

**Renovate instead of Dependabot**
Renovate offers more configuration options (semantic grouping, automerge, changelog links). However, Dependabot is native to GitHub, requires no additional token setup, and is sufficient for a project of this size. Renovate can replace it later if the project grows.

**Pinned exact versions (`1.2.3` instead of `^1.2.3`)**
Rejected. Exact pinning shifts the maintenance burden entirely to manual updates and prevents security patches from being applied automatically. The project uses semver ranges (`^` for dependencies, `~` for TypeScript) which allow safe minor/patch updates while blocking unexpected major bumps.

**No policy — update reactively**
Rejected. The current state (React 18, Vite 6, Vitest 3 all superseded by major releases within months of launch) demonstrates that reactive updates result in multi-major drift and CI noise. A defined cadence is cheaper than periodic emergency upgrades.

---

## Consequences

- `.github/dependabot.yml` is created as part of accepting this ADR
- The pre-feature checklist in every implementation session includes `npm audit --audit-level=high`
- CI logs should be free of deprecation warnings in normal operation
- Agents working on this project must not upgrade dependencies as a side-effect of feature work — upgrades go in their own PR
- `CLAUDE.md` should reference this ADR so coding agents are aware of the update-isolation rule
