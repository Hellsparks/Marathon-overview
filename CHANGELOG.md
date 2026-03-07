# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-07

### 🚀 Features & Enhancements
- **History & Analytics**: New `/history` page with Farm-wide and Printer-specific scopes, responsive SVG Timelines for printer uptime with day/week/month/custom filtering, interactive hover tooltips conveying print details/status, local ISO-styled date tables (`yyyy.mm.dd HH:MM`), and robust UI fallback states.
- **Printer Ecosystem Expansion**: Added native support and adapter services for OctoPrint and Duet/RepRapFirmware printers.
- **Bambu Lab LAN Developer Mode**: Added support with persistent MQTT connections, light and temp control, real-time status mapping, and a Bambu Connect cloud placeholder.
- **Spoolman Integration**: Added Bambu Lab color mapping, real-time physical AMS slot rendering, global filament guards, Bambu incompatibility warnings, and fixed slot routing and UI layout.
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
