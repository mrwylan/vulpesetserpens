# ADR-005 — Styling Approach

**Date:** 2026-03-08
**Status:** Accepted

## Context

The application targets creative musicians and has an explicit experience goal of feeling like an instrument rather than a file utility (Goal E1). The design is described as "dark, atmospheric" with intentional typography and colour. The styling approach must support this design vision while remaining easy for coding agents to read, modify, and extend consistently.

The choice of styling approach also affects bundle size, runtime performance, and the degree to which design intent is legible in the source code. Given the project's commitment to minimal dependencies (ADR-001), any styling solution that adds significant runtime overhead or requires a dedicated build plugin must justify that cost.

## Decision

Use **plain CSS with custom properties (CSS variables)** for all styling. No utility class framework (no Tailwind CSS). No CSS-in-JS library (no styled-components, no Emotion). No third-party component library (no Material UI, no Radix, no Chakra).

CSS is authored in `.css` files imported directly into the component or module that uses them. A global `styles/theme.css` file defines the design token set as custom properties on `:root`. All colours, spacing values, font sizes, and timing values used elsewhere in the codebase are references to these custom properties, not hardcoded literals.

The visual theme is dark and atmospheric: a near-black background, muted warm accent colours (amber, deep gold), monospaced or geometric typography, and minimal use of border radii or shadows beyond what serves legibility.

## Rationale

**Full design control.** Plain CSS imposes no structural constraints on what can be achieved. There are no utility class compositions to reason about, no theming APIs to navigate, and no component library's opinion about spacing or interaction states to override. The designer's intent is expressed directly in CSS, with no layer of abstraction between the rule and its effect.

**Zero runtime overhead.** Plain CSS is parsed and applied by the browser's native style engine. There is no JavaScript executed at render time to generate class names, inject style tags, or compute style objects. This is especially relevant for a tool where the main thread's responsiveness is important — audio analysis and waveform rendering are computationally intensive, and no additional work should be introduced for styling.

**Legibility for coding agents.** A CSS file with named custom properties is unambiguous. The property name communicates intent (`--color-accent-primary`, `--spacing-unit`, `--font-size-label`), the value is a plain CSS value, and the rule that uses it is a standard CSS declaration. Any agent trained on web development can read, modify, and extend this without framework-specific knowledge.

**Custom properties for theming.** CSS custom properties (`var(--name)`) provide all the theming capability needed: a single change to `:root` updates every component that references the variable. This is equivalent to Tailwind's theme configuration or a styled-components theme object, without any runtime cost or build-time dependency.

**Longevity.** Plain CSS has no version, no changelog, and no migration guide. The styling layer will not require updates when a framework releases a breaking version.

## Alternatives Considered

**Tailwind CSS** — Tailwind's utility-class approach offers rapid prototyping and enforced consistency through its design scale. It was rejected for two reasons. First, Tailwind's classes encode design decisions inside JSX, mixing structure and presentation in a way that makes the visual intent less legible in isolation. Second, Tailwind's opinionated spacing and colour scale works against an atmospheric, custom-designed aesthetic: achieving a specific shade of near-black or a particular rhythm of whitespace requires overriding the Tailwind theme, at which point the convenience advantage is partially lost. Third, Tailwind adds a build step (PostCSS plugin, JIT compilation) and requires configuring purging for production builds — overhead that is not justified here.

**CSS Modules** — CSS Modules provide local scoping of class names by transforming them at build time. They were considered as a way to avoid class name collisions across components. They were rejected because the application is small enough that disciplined BEM-style naming conventions or component-scoped selectors (e.g., `.ComponentName .child-element`) provide sufficient isolation without a build transformation. If the project grows significantly, CSS Modules may be adopted under a future ADR without changing the fundamental styling language.

**Styled-components / Emotion (CSS-in-JS)** — CSS-in-JS libraries co-locate styles with component logic and provide dynamic styles tied to component props. They were rejected because they introduce a runtime cost (style generation in JavaScript), increase bundle size, require a Babel or Vite plugin, and produce styles that are harder to inspect in browser DevTools. For a tool with no dynamic theming requirement (it has one fixed dark theme), the prop-driven dynamic styling capability is not needed.

**A component library (Material UI, Radix UI, Chakra UI)** — Pre-built component libraries offer accessible, polished components out of the box. They were rejected because they impose a visual language that conflicts with the atmospheric, custom aesthetic the product requires. The effort required to override a component library's defaults to achieve a fully custom dark instrument-like design is greater than building the components from scratch with plain CSS. Accessibility requirements (keyboard navigation, ARIA attributes) will be implemented directly in the React components without relying on a component library.

## Consequences

- All design tokens (colours, spacing, typography, animation durations) are defined as CSS custom properties in `/src/styles/theme.css`. This file is imported once in the application root. No hardcoded colour values or magic numbers appear elsewhere in `.css` files.
- Component-specific styles are in a `.css` file adjacent to the component file. The CSS file uses the component's name as the root class to establish a local scope by convention (e.g., `.WaveformCanvas`, `.CandidateList`).
- Global resets and base typographic styles are in `/src/styles/global.css`, imported once in the application root alongside `theme.css`.
- No inline `style` props are used in React components except for values that are genuinely dynamic and cannot be expressed as CSS custom property updates (e.g., a canvas element's computed width). Even then, prefer updating a CSS custom property on the element over a `style` prop where possible.
- The colour palette is dark-first. The background is near-black (`#0d0d0d` or similar). Accent colours are warm (amber, ochre, or deep gold range). Text is off-white, not pure white. No light mode is implemented in v1.
- Typography uses a single font pairing: a geometric or humanist sans-serif for UI labels and a monospaced font for numeric values (timestamps, sample counts, scores). Web-safe system fonts are preferred over web font imports to avoid additional network requests; if a web font is used, it must be loaded with `font-display: swap` and the fallback must be visually close to the loaded font.
- No CSS preprocessor (Sass, Less, Stylus) is used. Plain CSS custom properties and `calc()` are sufficient for all dynamic value computation.
