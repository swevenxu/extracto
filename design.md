# Design: Extracto

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; this file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: app screen
- Theme: Console, light navy and cobalt
- Brand: supplied navy Extracto wordmark from the project root, served at `public/brand/extracto-wordmark.png` with transparency preserved
- Axes: cool white and graphite / IBM Plex Sans / cobalt · posture: restrained

## Tokens
`src/app/tokens.css` is the source of truth. The roles:

```css
:root {
  --color-paper: oklch(98.6% 0.005 250);  --color-paper-2: oklch(96.2% 0.008 252);  --color-paper-3: oklch(93% 0.011 252);
  --color-ink: oklch(21% 0.028 262);  --color-ink-2: oklch(36% 0.022 260);  --color-muted: oklch(50% 0.018 258);  --color-rule: oklch(90% 0.009 252);
  --color-accent: oklch(52% 0.19 258);  --color-accent-ink: oklch(98.6% 0.005 250);  --color-focus: oklch(52% 0.19 258);
  --font-display: "IBM Plex Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-display);  --font-outlier: "IBM Plex Mono", ui-monospace, monospace;  --font-figure: "Space Grotesk Variable", var(--font-body);
  --radius-card: 10px;  --radius-pill: 6px;  --rule-hair: 1px;  --shadow-card: none;
}
```

IBM Plex Sans is self-hosted for interface text; IBM Plex Mono identifies invoice codes and source text; Space Grotesk sets numeric figures and dates. The spacing scale, type scale, easings and durations live in `src/app/tokens.css`.

## Controls
- Primary: cobalt fill · 6px radius · 40px minimum height
- Secondary: paper surface with a clear border · same radius and height

## Motion
- Character: still and brief; under reduced motion everything ends at once.

## Exports
`src/app/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added on request.
