# Marathon Mobile Roadmap

## Current State

Marathon is a desktop-first 3-panel layout (220px sidebar + flex main + 250px right panel) with almost no mobile breakpoints. One `@media (max-width: 700px)` exists for the queue page. All interactions are mouse/pointer-based including drag-and-drop spool assignment. Touch targets are too small throughout.

---

## Phase 1: Responsive Shell & Navigation

**Goal:** Make the app physically usable on a phone without feature changes.

### Layout (`AppShell.jsx`, `index.css`)
- Collapse sidebar into a hamburger drawer (slide-in from left, overlay)
- Hide right panel by default on `<768px` — surface it as a slide-up sheet or dedicated route
- NavBar: keep fixed at top, reduce padding, move theme/settings into sidebar drawer
- Main content fills 100vw

### Global CSS
- Add breakpoints: `480px` (phone), `768px` (tablet), `1024px` (desktop)
- All clickable elements: minimum 44x44px touch target on mobile
- Font sizes: bump body to 16px on mobile (prevents iOS zoom on input focus)
- Inputs: `font-size: 16px` minimum on mobile (same reason)
- Modals: full-screen on `<768px` instead of centered fixed-width

### Navigation (`Sidebar.jsx`)
- Mobile: bottom tab bar with 4-5 top-level icons (Dashboard, Files, Spoolman, History, Settings)
- Tap icon opens the section; sub-pages use header back-arrow navigation
- Desktop: unchanged

---

## Phase 2: Dashboard & Printer Control

**Goal:** Monitor and control prints from your phone.

### Printer Grid (`PrinterGrid.jsx`, `PrinterCard.jsx`)
- Single-column card stack on phone
- Compact card variant: webcam thumbnail (small), name, status badge, progress bar, temps — one row each
- Tap card → full-screen printer detail (not expand-in-place)
- Swipe between printers (optional, nice-to-have)

### Printer Detail (mobile-specific view)
- Full-width webcam stream at top
- Temps + progress below
- Action buttons (pause/resume/cancel) as large pill buttons
- Movement rose: works on touch already (verify touch events vs mouse events)
- Macro list: simple vertical button list
- Temperature presets: tap-to-apply cards

### Fleet Insights (`FleetInsights.jsx`)
- Move to a dedicated "Stats" tab or accessible via dashboard header icon
- Simplify to key numbers: printers online, active prints, utilization %

---

## Phase 3: Spoolman on Mobile

**Goal:** Browse, assign, and measure spools without drag-and-drop.

### Core Problem
Drag-and-drop doesn't work on mobile. Replace with tap-to-select flow:
1. Tap a color slot → opens spool picker (full-screen list/search)
2. Tap a spool → assigns it and returns

### Spool List (`SpoolmanPage.jsx`)
- Single-column spool cards
- Sticky search + filter bar at top
- Filter popover: full-screen overlay on mobile
- Spool cards: tap to view detail, long-press for quick actions

### AMS Slot Assignment (`SpoolmanPrinterCard.jsx`)
- Tap slot → spool picker overlay
- Show current assignment with clear button

### Teamster Scale
- Works as-is (just API calls) — ensure buttons are touch-sized
- Live weight display: large centered number

### Add Spool/Filament/Vendor Dialogs
- Full-screen on mobile instead of centered dialog
- Scroll-friendly form layout

---

## Phase 4: Files & Queue

**Goal:** Upload files, browse library, manage print queues.

### Files (`FilesPage.jsx`, `FileList.jsx`)
- List view by default on mobile (not grid)
- Folder breadcrumb: horizontal scroll if too wide
- File actions: tap to see detail, action buttons at bottom (send to printer, delete)
- Upload: native file picker (already works), show progress inline

### Send to Printer (`SendToPrinterModal.jsx`)
- Full-screen picker: list of online printers, tap to send
- Confirm dialog before sending

### Queue (`QueuePage.jsx`)
- Already has `@media (max-width: 700px)` — extend it
- Single-column queue items
- Drag-to-reorder → long-press + move, or up/down arrow buttons

---

## Phase 5: Projects & Templates

**Goal:** Create and track projects. Simplified creation flow on mobile.

### Project List (`ProjectsPage.jsx`)
- Card stack, single column
- Status badges prominent
- Tap → project detail

### Project Detail (`ProjectDetailView.jsx`)
- Vertical sections: info header, then plate groups
- Each plate: filename, status badge, print button
- Swap option: dropdown (already works on touch)
- Color assignments: inline, tap to reassign (spool picker)

### Create Project (`CreateProjectModal.jsx`)
- Full-screen wizard on mobile (not 3-column)
- Step 1: Name + date + add templates/files (vertical scroll)
- Step 2: Color assignments (vertical list, tap-to-assign)
- Step 3: Review + create
- Template picker: full-screen grid/list
- File picker: full-screen browser

### Templates
- View/browse: card list, single column
- Create/edit template: full-screen, vertical form flow

---

## Phase 6: History, Maintenance, Settings

**Goal:** Round out remaining pages.

### History (`HistoryPage.jsx`)
- Vertical timeline of prints
- Charts: simplify or hide on very small screens, show key stats as numbers
- Filter by printer: horizontal scrollable chip bar

### Maintenance (`MaintenancePage.jsx`)
- Single-column printer cards
- Task list with due/overdue badges
- "Mark Done" button — large, touch-friendly

### Settings (`SettingsPage.jsx`)
- Already mostly form-based — just needs width/padding adjustments
- Database import/export: standard file dialogs (works on mobile)
- Printer management: list with edit/delete, add form

---

## Technical Implementation Notes

### Approach: Responsive CSS, not a separate app
- Keep single React codebase
- CSS breakpoints + conditional rendering where layout differs significantly
- `useMediaQuery` hook (or `window.matchMedia`) for JS-level mobile detection
- No React Native, no separate mobile repo

### Shared Hook: `useIsMobile`
```js
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}
```

### Drag-and-Drop → Tap-to-Select
Every drag-drop interaction needs a mobile fallback:
- Spool → color slot: tap slot, pick from list
- File → folder: long-press file, "Move to..." action
- Printer reorder: up/down buttons or long-press drag (HTML5 DnD doesn't work on touch — use a library like `@dnd-kit` which supports touch, or add manual touchmove handlers)

### PWA (Progressive Web App)
- Add `manifest.json` for home-screen install
- Service worker for offline caching of static assets
- Push notifications for print completion (future)

### Viewport Meta Tag
Ensure `index.html` has:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

---

## What's NOT Ported (or Deferred)

| Feature | Reason |
|---|---|
| Per-printer theme scraping | Desktop luxury, adds complexity |
| Swatch STL generation | Rarely used, needs CadQuery backend |
| OrcaSlicer defaults sync | Desktop slicer integration only |
| Colorimeter | Hardware-specific, USB |
| Movement rose (full) | Basic jog buttons instead on mobile |
| Printer iframe embed | Mainsail already has its own mobile UI |
| Multi-column create project | Full-screen wizard replaces it |
| Currency conversion dialog | Low priority, settings-level |

---

## Priority Order

1. **Phase 1** — without this nothing else works on mobile
2. **Phase 2** — the #1 reason someone checks their phone: is my print ok?
3. **Phase 3** — spool management is frequent and currently impossible on touch
4. **Phase 4** — file management + queuing for starting new prints
5. **Phase 5** — projects are power-user but important
6. **Phase 6** — history/maintenance/settings are infrequent
