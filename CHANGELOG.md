# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-03-15

### 🚀 Features & Enhancements
- **Teamster Scale Integration**: Live load-cell readout in the spool measure dialog — polls the Teamster ESP32 device, shows weight in amber while stabilising and white when stable, disables the **Use** button until settled. Tare button available inline.
- **Teamster Settings Panel**: New Settings section to configure the Teamster URL, test connectivity, live-read toggle, inline tare, and calibration with a known weight.
- **Pressure Advance Auto-Apply**: Store a `pressure_advance` value on any Spoolman filament (via MCP or manually). When a spool is assigned to a Klipper printer, `SET_PRESSURE_ADVANCE ADVANCE=x.xxxx` is sent automatically via Moonraker.
- **MCP: filamentcolors.xyz colour lookup**: MCP server instructions now direct Claude to query `filamentcolors.xyz/api/swatch/` when the colour hex of a new filament is unknown.
- **MCP: pressure_advance field**: `create_filament` and `update_filament` tools expose `pressure_advance` stored in Spoolman's extra field.
- **Multi-colour Bambu colour mapping**: `set-active` now returns `bambu_colors` — an array of nearest Bambu colour approximations, one per colour in `multi_color_hexes`, instead of only the first.

### 🐛 Bug Fixes
- **RAL approximation with alpha hex**: `findClosestRal` and `buildColorStyle` now strip the alpha byte from 8-char `RRGGBBAA` values before comparison and CSS output; the hex column in the filament catalogue no longer shows `#FF5652D6`.
- **RAL approximation for multi-colour filaments**: `multi_color_hexes` is now preferred over `color_hex` when both are set, preventing a placeholder `color_hex` from shadowing the real colours.
- **Drag-and-drop spool assignment stale UI**: Spool assignment and clear now apply an optimistic local state update so the printer card reflects the change immediately without waiting for the next poll cycle.
- **TPU95A material compatibility false warning**: Filament guard now normalises both the spool material and printer's supported list (e.g. `TPU95A` → `TPU`) before comparing, eliminating spurious incompatibility warnings.

### 💅 Styling & Organisation
- Spool measure dialog: live scale readout row with amber/white colour state and inline stabilising label.

## [1.1.0] - 2026-03-07

### 🚀 Features & Enhancements
- **History & Analytics**: New `/history` page with Farm-wide and Printer-specific scopes, responsive SVG Timelines for printer uptime with day/week/month/custom filtering, interactive hover tooltips conveying print details/status, local ISO-styled date tables (`yyyy.mm.dd HH:MM`), and robust UI fallback states.
- **Printer Ecosystem Expansion**: Added native support and adapter services for OctoPrint and Duet/RepRapFirmware printers.
- **Bambu Lab LAN Developer Mode**: Added support with persistent MQTT connections, light and temp control, real-time status mapping, and a Bambu Connect cloud placeholder.
- **Spoolman Integration**: Added Bambu Lab color mapping, real-time physical AMS slot rendering, global filament guards, Bambu incompatibility warnings, and fixed slot routing and UI layout.
- **Spoolman Extra Fields & Tools**: Added automated Filament Swatch Tracking system with optional "Print Swatch" prompts on new spool additions, Auto-Create Extra Field buttons in Settings, click-to-buy Product Links in the catalogue, and a "Filaments with TD Value" HueForge JSON export filter.
- **Enhanced Printer UI**: Upgraded the movement rose widget with a 100mm outer ring, 50mm Z alignment, and horizontal extruder steps.

### 🐛 Bug Fixes
- Avoided missing physical AMS previews by correcting status prop mapping.
- Handled Spoolman AMS slot CSS overflow and enabled A1 AMS Lite MQTT payloads.
- Added strict guarding for array access on active spool assignments to prevent UI crashes.
- Fixed correct TLS camera authentication and initialization sequences for Bambu integrations.

### 💅 Styling & Organization
- Adjusted application Grid layout structure to accommodate new user specifications.
- Applied Bambu green background banners to Bambu printer card headers.
- Hidden Bambu printers from the standard unassigned dashboard sidebar for better categorization.
