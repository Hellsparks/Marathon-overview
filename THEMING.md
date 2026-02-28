# Marathon Theming System — Architecture & Implementation Notes

## Overview

Marathon has two independent theming layers:

1. **Global theme** — applies to the whole app (navbar, sidebar, all pages)
2. **Per-printer card theme** — each printer card can independently use CSS scraped from its own Mainsail instance, or custom CSS entered in printer settings

These two layers must not interfere with each other.

---

## Global Theming (`ThemeProvider.jsx`)

### Built-in themes
Controlled by `data-theme` attribute on `<html>`. Defined in `frontend/src/themes.css`.
Dark (default) is defined in `frontend/src/index.css :root`.

**CRITICAL RULE:** `themes.css` must NEVER set direct properties on component selectors
(`.printer-card`, `.btn-primary`, etc.). All customisations must be CSS variables:

```css
[data-theme="cyberpunk"] {
    --primary: #ff00ff;
    --card-glow: 0 0 20px rgba(255,0,255,.08);    /* ← variable, not direct rule */
    --btn-text-shadow: 0 0 8px rgba(255,0,255,.5); /* ← variable, not direct rule */
}
```

`index.css` references these with fallback defaults:
```css
.printer-card { box-shadow: var(--card-glow, var(--shadow)); }
.btn-primary  { text-shadow: var(--btn-text-shadow, none); }
```

This ensures the per-printer polyfill can override everything by simply resetting variables.

### Community themes (Mainsail GitHub repos)
Loaded as `<link rel="stylesheet">` by ThemeProvider. Repos cloned to `backend/data/themes/`.
REST API: `GET/POST/DELETE /api/themes` (handled by `backend/src/routes/themes.js`).

### Vuetify class aliasing
Mainsail community themes target Vuetify 2/3 DOM class names. ThemeProvider adds these to Marathon elements when a community theme is active:

```
body              → v-application  theme--dark  v-theme--dark  v-locale--is-ltr
.navbar           → v-app-bar  v-toolbar  theme--dark
.sidebar          → v-navigation-drawer  theme--dark
.app-main         → v-main
.btn (all)        → v-btn          ← done via querySelectorAll
```

**Important:** `.printer-card` is intentionally NOT in `VUETIFY_COMPONENTS`.
`v-card theme--dark` are baked into PrinterCard JSX instead (see below).
ThemeProvider managing these caused a bug: `removeVuetifyClasses()` on theme switch
would strip them from the DOM, but React only re-applies JSX classNames on re-render
(which may not happen if PrinterCard's parent didn't re-render).

### MAINSAIL_POLYFILL
Bridges Vuetify CSS vars → Marathon CSS vars globally (for community themes):
- Vuetify 3: `--v-theme-primary` (space-sep RGB) → `--primary` via `rgb(var(...))`
- Vuetify 2: `--v-primary-base` (hex) → `--primary` on `body.v-application`
- Structural: makes `#root`, `.app-shell`, `.app-body`, `.app-main` transparent so community themes' background images show through

---

## Per-Printer Card Theming (`PrinterCard.jsx`)

### Isolation Architecture

Each printer card has **exactly one CSS source**:
- `theme_mode: 'global'` → card inherits from global theme naturally (no injection)
- `theme_mode: 'scrape'` or `'custom'` → card is **fully isolated** via three injected CSS layers

### Scrape/Custom mode — three-layer isolation

```html
<style>
  {cardDefaults}   <!-- 1. Reset ALL Marathon vars to dark-theme baseline -->
  {scopedCss}      <!-- 2. Scoped Mainsail CSS (overrides defaults it defines) -->
  {cardPolyfill}   <!-- 3. Bridges Vuetify vars → stamped on .printer-card -->
</style>
```

**Layer 1: cardDefaults** — Resets ALL Marathon CSS variables (--primary, --surface,
--border, --text, --danger, --warning, --success, etc.) on `[data-printer-id="X"]`
to the dark theme's hardcoded values. This blocks inheritance from whichever global
theme is active on `<html>`. ALL accent colors MUST be included — if you omit them,
the global theme bleeds into isolated cards.

**Layer 2: scopedCss** — The Mainsail CSS with selectors scoped to `[data-printer-id="X"]`.
Same specificity as cardDefaults, but later in source order, so it wins for any vars
it defines. This is where the printer's own `--v-theme-primary` etc. get set.

**Layer 3: cardPolyfill** — The JS code detects whether the scraped CSS uses Vuetify 2
or Vuetify 3 variables, then builds the correct var references:
- V2: `--card-primary: var(--v-primary-base)`
- V3: `--card-primary: rgb(var(--v-theme-primary))` (wraps space-sep RGB in `rgb()`)
- Neither: `--card-primary: var(--primary)` (falls back to dark defaults)

Then stamps ALL Marathon vars + direct properties (background, border-color, color,
box-shadow) with `!important` on `.printer-card`.

### DOM structure
```html
<div data-printer-id="1" style="display:contents">
  <style>{cardDefaults}{scopedCss}{cardPolyfill}</style>
  <div class="printer-card state-printing v-card theme--dark isolated-theme">
    <div class="printer-card-header v-card__title">...</div>
    <button class="btn btn-sm v-btn">Home</button>
    ...
    <div class="printer-card-footer v-card__actions">...</div>
  </div>
</div>
```

**`isolated-theme` class** — Added to cards with per-printer themes. Used by `index.css`
font isolation rule (`.printer-card:not(.isolated-theme) { font-family: Inter }`) to
allow Mainsail fonts on themed cards while keeping Inter on global-mode cards.

**`display: contents`** — The wrapper div doesn't generate a box (preserves CSS grid
layout of the printer grid) but IS in the DOM tree. CSS selectors still match based
on DOM ancestry, so `[data-printer-id="1"] .v-btn` only matches buttons inside card 1.

### Printer settings (DB columns)
- `theme_mode`: `'global'` | `'scrape'` | `'custom'`
- `custom_css`: free-form CSS text (used when `theme_mode === 'custom'`)

### Scrape mode + caching
Calls `POST /api/printers/scrape-theme` → backend fetches
`http://{host}:{port}/server/files/config/.theme/custom.css` from Moonraker.

**Caching:** A module-level `scrapedCssCache` Map (keyed by `host:port`) stores scraped
CSS. The scrape only happens once per printer host — subsequent renders and page
navigations use the cached version. The cache persists for the lifetime of the SPA
(cleared on full page reload).

---

## CSS Scoping — `scopeCSS(css, scope)` function

**The core problem:** When multiple cards are on the same page, their `<style>` tags
are ALL active globally. Without scoping, card 2's CSS would override card 1's CSS
(cascade: last rule wins). This was the primary cause of cross-card style bleeding.

**Solution:** A recursive CSS scoper defined at module level in `PrinterCard.jsx`:

### Selector replacement rules
```
:root / body / html / .v-application     →  replaced with [data-printer-id="X"]
.v-theme--dark / .v-theme--light          →  replaced with [data-printer-id="X"]
.v-locale--is-ltr                         →  replaced with [data-printer-id="X"]
every other selector                      →  prefixed with [data-printer-id="X"]
@media / @supports / @layer              →  body recursively scoped
@keyframes / @font-face / @charset       →  kept as-is (global, not scopeable)
@import                                   →  STRIPPED (doesn't work in <style> tags)
```

### @import stripping — critical gotcha

Google Fonts URLs contain semicolons: `url('...wght@400;500;600;700...')`.
A naive regex like `/@import\s[^;]+;/` stops at the FIRST `;` inside the URL,
leaving garbage text that breaks all subsequent CSS rules.

**Current approach:** Multi-pass stripping:
1. `@import url('...')` with quoted URLs (handles semicolons inside quotes)
2. `@import url(...)` without quotes
3. `@import '...'` string format
4. `@import ...;` fallback for any remaining

**DO NOT simplify this to a single regex. It will break.**

### Comma-separated selector handling

Mainsail CSS often has `:root, .v-theme--dark { ... }`. The function splits by `,`
and processes each part independently. Both `:root` and `.v-theme--dark` are replaced
with the scope selector, so the result is `[data-printer-id="X"], [data-printer-id="X"] { ... }`
which correctly applies to the wrapper element only.

---

## Vuetify Version Detection

The polyfill detects which Vuetify version the scraped CSS uses by scanning the raw CSS
with regex BEFORE building the CSS polyfill string:

```js
const hasV2 = rawCss && /--v-primary-base\s*:/i.test(rawCss);
const hasV3 = rawCss && /--v-theme-primary\s*:/i.test(rawCss);
```

### Why JavaScript detection (not CSS var() fallback)?

CSS `var()` fallback doesn't work for Vuetify 3 detection because:
- V3 vars use space-separated RGB: `--v-theme-primary: 192, 0, 32`
- Need `rgb()` wrapper: `rgb(var(--v-theme-primary))`
- CSS `var(--v-theme-primary, fallback)` doesn't trigger the fallback when the var IS
  defined but set to empty string — it uses the empty string, producing `rgb()` (invalid)
- The invalid value doesn't cascade to the next `var()` in the chain; it just makes
  the whole property invalid, resulting in BLACK

**DO NOT try to detect V3 vars in pure CSS.** The empty-string-vs-undefined problem
makes CSS `var()` fallback chains unreliable for this purpose.

### Vuetify 2 variables
```
--v-primary-base     → hex color (e.g. #ff6a00)
--v-error-base       → hex color
--v-warning-base     → hex color
--v-success-base     → hex color
--v-sheet-bg-color   → hex color (card background)
```

### Vuetify 3 variables
```
--v-theme-primary    → space-sep RGB (e.g. 224, 90, 0)  — needs rgb() wrapper
--v-theme-error      → space-sep RGB
--v-theme-warning    → space-sep RGB
--v-theme-success    → space-sep RGB
--v-theme-surface    → space-sep RGB
--v-theme-on-surface → space-sep RGB (text color)
```

---

## cardPolyfill — complete variable bridge

The polyfill covers EVERY Marathon CSS variable to ensure complete isolation:

```css
/* Intermediaries (on wrapper — avoids CSS var cycles) */
[data-printer-id="X"] {
    --card-primary:  rgb(var(--v-theme-primary));    /* V3 example */
    --card-warning:  rgb(var(--v-theme-warning));
    --card-danger:   rgb(var(--v-theme-error));
    --card-success:  rgb(var(--v-theme-success));
    --card-surface:  rgb(var(--v-theme-surface));
    --card-text:     rgb(var(--v-theme-on-surface));
}

/* ALL vars on .printer-card — fully isolated from global theme */
[data-printer-id="X"] .printer-card {
    --primary / --primary-d / --warning / --danger / --success
    --surface / --surface2 / --border / --text / --text-muted
    --bg / --offline / --radius / --shadow
    --card-glow / --card-glow-active / --btn-text-shadow
    --btn-primary-bg / --btn-primary-bg-hover
    background / border-color / color / box-shadow  (all !important)
}
```

**Why `--card-*` intermediaries (not just `--primary` directly)?**
Setting `--primary: var(--v-primary-base, var(--primary))` on an element where `--primary`
is also set via the scoped CSS would create a CSS custom property cycle. Using `--card-primary`
as the intermediary on the wrapper element avoids this because the wrapper and `.printer-card`
are different elements in the DOM tree.

---

## Backend Theme Routes (`backend/src/routes/themes.js`)

- `GET  /api/themes` — list all from `data/themes.txt` with install/cssPath status
- `POST /api/themes` — add URLs (multi-URL textarea), git clone each
- `DELETE /api/themes/:name` — remove from list + delete directory

**URL parsing:** `cleanGitHubUrl()` strips `/tree/branch`, `/blob/...` suffixes so git clone works:
```
https://github.com/user/repo/tree/main  →  https://github.com/user/repo
```

**Static serving:** `app.use('/themes', express.static(..., { dotfiles: 'allow' }))`
The `dotfiles: 'allow'` is required to serve `.theme/` subdirectories.

**CSS discovery:** Checks `custom.css` then `.theme/custom.css` in the cloned repo.

---

## Known Remaining Limitations

1. **cp2077 hardcoded themes**: Some Mainsail themes use hardcoded colours on compound
   Vuetify selectors (`.v-btn:not(.v-btn--round).v-size--default`) that don't match
   Marathon's simplified element classes. The scoped CSS applies where class aliases
   exist, but unique Vuetify compound selectors won't match.

2. **`@keyframes` in scoped CSS**: Kept as-is (global). If two Mainsail themes define
   `@keyframes` with the same name, the second definition wins globally. This is
   unavoidable without renaming keyframes.

3. **Scrape endpoint port**: Fetches from `http://{host}:{port}` using Moonraker's file API.
   If Moonraker is on a non-standard port this may need adjustment.

4. **Cache invalidation**: The `scrapedCssCache` Map only clears on full page reload.
   If a user changes their Mainsail theme, they need to reload Marathon to pick up
   the new CSS.
