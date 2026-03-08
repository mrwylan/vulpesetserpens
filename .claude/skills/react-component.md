---
name: react-component
description: Scaffold a new React component following project conventions. Use when creating any new component in src/components/.
argument-hint: "<ComponentName> [optional: brief description of what it does]"
---

# React Component Scaffold

Create a new component following the project structure and conventions defined in `doc/implementation/project-structure.md` and ADR-001/ADR-005.

## File structure to create

For a component named `<ComponentName>`:

```
src/components/<ComponentName>/
├── <ComponentName>.tsx     ← React component
└── <ComponentName>.css     ← Co-located styles
```

No index.ts barrel files. Import directly from the file path.

## Component template

```tsx
// src/components/<ComponentName>/<ComponentName>.tsx
import './ComponentName.css'

interface <ComponentName>Props {
  // define props here — no `any`, use explicit types
}

export function <ComponentName>({ ...props }: <ComponentName>Props) {
  return (
    <div className="ComponentName">
      {/* implementation */}
    </div>
  )
}
```

## CSS template

```css
/* src/components/<ComponentName>/<ComponentName>.css */
/* Root class matches component name — provides local scope by convention */
.ComponentName {
  /* use tokens from src/styles/theme.css only — no hardcoded values */
  /* example: color: var(--color-text-primary); */
}
```

## Rules

- **Functional components only** — no class components (ADR-001)
- **No inline `style` props** unless the value is genuinely dynamic and cannot be a CSS custom property (ADR-005)
- **All colours and spacing from theme tokens** (`var(--color-*)`, `var(--space-*)`) — never hardcode hex values or px values (ADR-005)
- **No `any` types** — define explicit prop interfaces
- **No state management libraries** — use `useState`, `useReducer`, `useContext` only (ADR-001)
- **No new npm packages** without justification — prefer native browser APIs

## After scaffolding

If this component has user-visible behaviour covered by a use case, add an E2E test in `tests/e2e/` and follow the `tdd-workflow` skill.
