#!/usr/bin/env node
/**
 * Marathon MCP Server
 *
 * Exposes Marathon's printer fleet management capabilities as MCP tools.
 * Configure via environment variables:
 *   MARATHON_URL     — base URL of the Marathon backend (default: http://localhost:3000)
 *   MCP_TRANSPORT    — "http" to run as HTTP server; omit for stdio (default)
 *   MCP_PORT         — HTTP listen port when MCP_TRANSPORT=http (default: 3001)
 */

import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = (process.env.MARATHON_URL || 'http://localhost:3000').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Marathon API error ${res.status}: ${data?.error || text}`);
  }
  return data;
}

const get = (path) => api('GET', path);
const post = (path, body) => api('POST', path, body);
const put = (path, body) => api('PUT', path, body);
const del = (path) => api('DELETE', path);
const patch = (path, body) => api('PATCH', path, body);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  // ── Printers & Status ────────────────────────────────────────────────────
  {
    name: 'list_printers',
    description: 'List all printers with their current live status (temperatures, print job progress, state).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_printer_status',
    description: 'Get detailed live status for a single printer by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number', description: 'Printer ID' },
      },
      required: ['printer_id'],
    },
  },
  {
    name: 'set_temperature',
    description: 'Set hotend or bed temperature on a printer.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        heater: { type: 'string', description: 'e.g. "extruder", "heater_bed", "extruder1"' },
        temp: { type: 'number', description: 'Target temperature in °C (0 to turn off)' },
      },
      required: ['printer_id', 'heater', 'temp'],
    },
  },
  {
    name: 'send_gcode',
    description: 'Send a raw G-code command or script to a printer.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        script: { type: 'string', description: 'G-code command(s), newline-separated' },
      },
      required: ['printer_id', 'script'],
    },
  },
  {
    name: 'list_macros',
    description: 'List all available G-code macros on a printer.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
      },
      required: ['printer_id'],
    },
  },
  {
    name: 'run_macro',
    description: 'Execute a named G-code macro on a printer, with optional parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        macro: { type: 'string', description: 'Macro name, e.g. "START_PRINT"' },
        params: { type: 'string', description: 'Optional macro parameters, e.g. "BED_TEMP=60 EXTRUDER_TEMP=215"' },
      },
      required: ['printer_id', 'macro'],
    },
  },

  // ── Print Control ─────────────────────────────────────────────────────────
  {
    name: 'start_print',
    description: 'Start printing a file that has already been sent to a printer.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        filename: { type: 'string', description: 'Filename on the printer (as returned by send_file or list_printer_files)' },
      },
      required: ['printer_id', 'filename'],
    },
  },
  {
    name: 'pause_print',
    description: 'Pause the current print job on a printer.',
    inputSchema: {
      type: 'object',
      properties: { printer_id: { type: 'number' } },
      required: ['printer_id'],
    },
  },
  {
    name: 'resume_print',
    description: 'Resume a paused print job on a printer.',
    inputSchema: {
      type: 'object',
      properties: { printer_id: { type: 'number' } },
      required: ['printer_id'],
    },
  },
  {
    name: 'cancel_print',
    description: 'Cancel the current print job on a printer.',
    inputSchema: {
      type: 'object',
      properties: { printer_id: { type: 'number' } },
      required: ['printer_id'],
    },
  },

  // ── G-code File Library ───────────────────────────────────────────────────
  {
    name: 'list_files',
    description: 'List all G-code files in the Marathon central library.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_file_compatibility',
    description: 'Check if a file is compatible with a specific printer (bed size, filament type).',
    inputSchema: {
      type: 'object',
      properties: {
        file_id: { type: 'number' },
        printer_id: { type: 'number' },
      },
      required: ['file_id', 'printer_id'],
    },
  },
  {
    name: 'send_file_to_printer',
    description: 'Upload a file from the Marathon library to a printer\'s local storage.',
    inputSchema: {
      type: 'object',
      properties: {
        file_id: { type: 'number', description: 'File ID from the Marathon library' },
        printer_id: { type: 'number' },
      },
      required: ['file_id', 'printer_id'],
    },
  },

  // ── Queue Management ──────────────────────────────────────────────────────
  {
    name: 'get_queue',
    description: 'Get the current print queue for a printer.',
    inputSchema: {
      type: 'object',
      properties: { printer_id: { type: 'number' } },
      required: ['printer_id'],
    },
  },
  {
    name: 'add_to_queue',
    description: 'Add one or more files to a printer\'s print queue.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        filenames: { type: 'array', items: { type: 'string' }, description: 'Filenames already on the printer' },
      },
      required: ['printer_id', 'filenames'],
    },
  },
  {
    name: 'remove_from_queue',
    description: 'Remove a job from a printer\'s queue.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        job_id: { type: 'string', description: 'Queue job ID (from get_queue)' },
      },
      required: ['printer_id', 'job_id'],
    },
  },
  {
    name: 'start_queue',
    description: 'Tell a printer to start processing its job queue.',
    inputSchema: {
      type: 'object',
      properties: { printer_id: { type: 'number' } },
      required: ['printer_id'],
    },
  },

  // ── Projects & Plates ─────────────────────────────────────────────────────
  {
    name: 'list_projects',
    description: 'List all projects (multi-plate print jobs) in Marathon.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_plates',
    description: 'List all plates for a specific project, including plate ID, name, status, filename, and estimated duration. Use this to find plate_id values before calling print_plate.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID from list_projects' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'print_plate',
    description: 'Send a project plate directly to a printer and start or queue it.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number' },
        plate_id: { type: 'number' },
        printer_id: { type: 'number' },
      },
      required: ['project_id', 'plate_id', 'printer_id'],
    },
  },
  {
    name: 'assign_filament_to_plate',
    description: 'Associate a Spoolman spool with a project plate (tracks filament usage per plate).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number' },
        spool_id: { type: 'number', description: 'Spoolman spool ID' },
        toolhead: { type: 'number', description: 'Toolhead/extruder index (0-based)', default: 0 },
      },
      required: ['project_id', 'spool_id'],
    },
  },

  // ── Spoolman ──────────────────────────────────────────────────────────────
  {
    name: 'list_spools',
    description: 'List all spools in Spoolman with color, material, vendor, and remaining filament.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_spool',
    description: 'Get full details for a single Spoolman spool.',
    inputSchema: {
      type: 'object',
      properties: {
        spool_id: { type: 'number' },
      },
      required: ['spool_id'],
    },
  },
  {
    name: 'list_filaments',
    description: 'List all filament profiles in Spoolman (brand, material, color, temperature settings).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'assign_spool_to_printer',
    description: 'Assign a Spoolman spool as the active spool on a printer toolhead (or Bambu AMS tray). This sets the color/material context for the next print.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
        spool_id: { type: 'number', description: 'Spoolman spool ID' },
        toolhead: { type: 'number', description: 'Toolhead index (0-based). For Bambu, this is the AMS tray number.', default: 0 },
      },
      required: ['printer_id', 'spool_id'],
    },
  },
  {
    name: 'use_filament',
    description: 'Record filament consumption on a spool (by length in mm or weight in grams).',
    inputSchema: {
      type: 'object',
      properties: {
        spool_id: { type: 'number' },
        length_mm: { type: 'number', description: 'Length consumed in mm (optional)' },
        weight_g: { type: 'number', description: 'Weight consumed in grams (optional)' },
      },
      required: ['spool_id'],
    },
  },
  {
    name: 'get_ams_slots',
    description: 'Get the current spool assignment for each AMS tray on a Bambu printer.',
    inputSchema: {
      type: 'object',
      properties: {
        printer_id: { type: 'number' },
      },
      required: ['printer_id'],
    },
  },
  {
    name: 'get_inventory',
    description: 'Get Spoolman filament inventory status — how many spools you have vs. your target stock levels.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // ── Spoolman — Vendors (Manufacturers) ────────────────────────────────────
  {
    name: 'list_vendors',
    description: 'List all filament manufacturers/vendors in Spoolman.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_vendor',
    description: 'Create a new filament manufacturer/vendor in Spoolman.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Manufacturer name, e.g. "Bambu Lab"' },
        comment: { type: 'string', description: 'Optional notes' },
        external_id: { type: 'string', description: 'Optional external reference ID' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_vendor',
    description: 'Update an existing vendor/manufacturer in Spoolman.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor_id: { type: 'number' },
        name: { type: 'string' },
        comment: { type: 'string' },
        external_id: { type: 'string' },
      },
      required: ['vendor_id'],
    },
  },
  {
    name: 'delete_vendor',
    description: 'Delete a vendor/manufacturer from Spoolman.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor_id: { type: 'number' },
      },
      required: ['vendor_id'],
    },
  },

  // ── Spoolman — Filament Profiles ──────────────────────────────────────────
  {
    name: 'create_filament',
    description: `Create a new filament profile in Spoolman. A filament profile is the template; spools are individual rolls of that profile.

NAMING RULES — follow these exactly:
- name = color/variant only. Do NOT include the material type or brand. e.g. "Blue Green", "Silk Gold", "Bicolor Red Blue". Wrong: "PLA Blue Green", "PolyTerra Matte Black".
- material = the polymer type only, e.g. "PLA", "PETG", "TPU". Do not put color or brand here.

COLOR RULES:
- For single-color filaments: use color_hex only.
- For multi-color/bicolor filaments: use multi_color_hexes (comma-separated, no #) + multi_color_direction. Do NOT set color_hex when using multi_color_hexes.
- Always ask or infer each individual color for multicolor filaments — never blend them into one hex.

SPOOL WEIGHT: Always include spool_weight when it is known or can be found — it is required for accurate remaining-filament calculations after weighing.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Color/variant only — no material or brand. e.g. "Blue Green", "Silk Gold", "Bicolor Red Blue"' },
        vendor_id: { type: 'number', description: 'Vendor/manufacturer ID (from list_vendors)' },
        material: { type: 'string', description: 'Polymer type only, e.g. "PLA", "PETG", "TPU95A". No color or brand.' },
        density: { type: 'number', description: 'Density in g/cm³, e.g. 1.24 for PLA' },
        diameter: { type: 'number', description: 'Filament diameter in mm, e.g. 1.75' },
        weight: { type: 'number', description: 'Net filament weight per spool in grams, e.g. 1000' },
        spool_weight: { type: 'number', description: 'Empty spool weight in grams — always include when known' },
        color_hex: { type: 'string', description: 'Single color as hex without #. Omit entirely when using multi_color_hexes.' },
        multi_color_hexes: { type: 'string', description: 'Comma-separated individual hex colors without # for multicolor filaments, e.g. "0000FF,FF0000". Use this for any bicolor/multicolor filament. Do NOT also set color_hex.' },
        multi_color_direction: { type: 'string', description: '"longitudinal" (stripes along length) or "coaxial" (concentric rings). Required when multi_color_hexes is set.' },
        extruder_temp: { type: 'number', description: 'Recommended extruder temperature °C' },
        bed_temp: { type: 'number', description: 'Recommended bed temperature °C' },
        article_number: { type: 'string', description: 'Manufacturer article/SKU number' },
        price: { type: 'number', description: 'Price in local currency. ALWAYS include if known/mentioned, e.g. if the user provides it.' },
        comment: { type: 'string', description: 'Optional notes' },
        url: { type: 'string', description: 'Product page URL. ALWAYS include when available — extracted from product links or pages the user provides.' },
        swatch: { type: 'boolean', description: 'Whether a physical swatch has been printed for this filament' },
        pressure_advance: { type: 'number', description: 'Klipper pressure advance value for this filament, e.g. 0.04. Automatically applied when spool is assigned to a Klipper printer.' },
      },
      required: ['material', 'density', 'diameter'],
    },
  },
  {
    name: 'update_filament',
    description: `Update an existing filament profile in Spoolman.

Same naming and color rules as create_filament:
- name = color/variant only, no material/brand prefix.
- For multicolor: set multi_color_hexes (comma-separated hex, no #) + multi_color_direction. Do NOT set color_hex at the same time.
- For single-color: set color_hex only.
- ALWAYS include price and url if the user mentions them.`,
    inputSchema: {
      type: 'object',
      properties: {
        filament_id: { type: 'number', description: 'ID of the filament profile to update' },
        name: { type: 'string', description: 'Color/variant only — no material or brand prefix' },
        vendor_id: { type: 'number' },
        material: { type: 'string', description: 'Polymer type only, e.g. "PLA", "TPU95A"' },
        density: { type: 'number' },
        diameter: { type: 'number' },
        weight: { type: 'number' },
        spool_weight: { type: 'number', description: 'Empty spool weight in grams' },
        color_hex: { type: 'string', description: 'Single color hex without #. Omit when using multi_color_hexes.' },
        multi_color_hexes: { type: 'string', description: 'Comma-separated individual hex colors without # for multicolor filaments. Do NOT also set color_hex.' },
        multi_color_direction: { type: 'string', description: '"longitudinal" (stripes) or "coaxial" (rings). Required with multi_color_hexes.' },
        extruder_temp: { type: 'number' },
        bed_temp: { type: 'number' },
        article_number: { type: 'string' },
        price: { type: 'number', description: 'Price in local currency' },
        comment: { type: 'string' },
        url: { type: 'string', description: 'Product page URL' },
        swatch: { type: 'boolean', description: 'Whether a physical swatch has been printed for this filament' },
        pressure_advance: { type: 'number', description: 'Klipper pressure advance value, e.g. 0.04' },
      },
      required: ['filament_id'],
    },
  },
  {
    name: 'delete_filament',
    description: 'Delete a filament profile from Spoolman.',
    inputSchema: {
      type: 'object',
      properties: {
        filament_id: { type: 'number' },
      },
      required: ['filament_id'],
    },
  },

  // ── Spoolman — Spool Management ───────────────────────────────────────────
  {
    name: 'update_spool',
    description: 'Update metadata on an existing spool (lot number, location, comment, archive status). Use measure_spool to update remaining weight instead.',
    inputSchema: {
      type: 'object',
      properties: {
        spool_id: { type: 'number', description: 'Spool ID to update' },
        lot_nr: { type: 'string', description: 'Lot/batch number from spool label' },
        comment: { type: 'string', description: 'Notes about this spool' },
        location: { type: 'string', description: 'Physical storage location' },
        archived: { type: 'boolean', description: 'Whether this spool is archived/retired' },
        first_used: { type: 'string', description: 'ISO 8601 datetime when spool was first used' },
        last_used: { type: 'string', description: 'ISO 8601 datetime of last use' },
      },
      required: ['spool_id'],
    },
  },
  {
    name: 'create_spool',
    description: 'Register a new spool in Spoolman. Requires a filament profile ID. Specify either initial_weight (net filament) or remaining_weight to set the starting amount.',
    inputSchema: {
      type: 'object',
      properties: {
        filament_id: { type: 'number', description: 'Filament profile ID (from list_filaments or create_filament)' },
        initial_weight: { type: 'number', description: 'Starting net filament weight in grams (new spool). If omitted, uses filament profile default.' },
        remaining_weight: { type: 'number', description: 'Current remaining filament weight in grams (for a partially used spool)' },
        used_weight: { type: 'number', description: 'Amount already consumed in grams (alternative to remaining_weight)' },
        spool_weight: { type: 'number', description: 'Override empty spool weight in grams' },
        lot_nr: { type: 'string', description: 'Lot/batch number from spool label' },
        comment: { type: 'string', description: 'Optional notes' },
        first_used: { type: 'string', description: 'ISO 8601 datetime when spool was first used' },
        last_used: { type: 'string', description: 'ISO 8601 datetime of last use' },
      },
      required: ['filament_id'],
    },
  },
  {
    name: 'measure_spool',
    description: 'Update a spool\'s remaining filament by placing it on a scale. Provide the total gross weight (spool + filament). Spoolman subtracts the empty spool weight automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        spool_id: { type: 'number' },
        total_weight: { type: 'number', description: 'Gross weight in grams (spool + remaining filament)' },
      },
      required: ['spool_id', 'total_weight'],
    },
  },
  {
    name: 'delete_spool',
    description: 'Delete a spool from Spoolman.',
    inputSchema: {
      type: 'object',
      properties: {
        spool_id: { type: 'number' },
      },
      required: ['spool_id'],
    },
  },

  {
    name: 'generate_swatch',
    description: 'Generate a swatch STL file for a filament and save it to the Marathon data directory. Returns the saved file path. Use list_filaments to find filaments where extra.swatch is not "true", then call this for each one to batch-generate swatches.',
    inputSchema: {
      type: 'object',
      properties: {
        filament_id: { type: 'number', description: 'Filament ID to generate swatch for' },
      },
      required: ['filament_id'],
    },
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  {
    name: 'list_maintenance',
    description: 'Get maintenance status for all printers — which tasks are due, overdue, or OK.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'log_maintenance_done',
    description: 'Mark a maintenance task as completed on a printer (resets the interval timer).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number' },
        printer_id: { type: 'number' },
      },
      required: ['task_id', 'printer_id'],
    },
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  {
    name: 'get_fleet_stats',
    description: 'Get fleet-wide print statistics — total prints, runtime hours, filament used, success rate.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_file_stats',
    description: 'Get per-file print statistics — how many times each file was printed, average duration, filament used.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_utilization',
    description: 'Get per-printer utilization stats — runtime hours and print counts.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_print_history',
    description: 'Get recent print job history across all printers.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleTool(name, args) {
  switch (name) {

    // ── Printers & Status ─────────────────────────────────────────────────
    case 'list_printers': {
      const [printers, status] = await Promise.all([
        get('/api/printers'),
        get('/api/status'),
      ]);
      return printers.map(p => {
        const s = status[p.id] ?? {};
        return {
          id: p.id,
          name: p.name,
          host: p.host,
          port: p.port,
          enabled: p.enabled,
          state: s.state ?? 'unknown',
          message: s.message ?? null,
          filename: s.filename ?? null,
          progress: s.progress != null ? Math.round(s.progress * 1000) / 10 : null,
          hotend_actual: s.hotend_actual ?? null,
          hotend_target: s.hotend_target ?? null,
          bed_actual: s.bed_actual ?? null,
          bed_target: s.bed_target ?? null,
          print_duration: s.print_duration ?? null,
        };
      });
    }

    case 'get_printer_status': {
      const [printer, status] = await Promise.all([
        get(`/api/printers`).then(list => list.find(p => p.id === args.printer_id) ?? null),
        get(`/api/status/${args.printer_id}`),
      ]);
      // Return full status but drop raw Moonraker sensor arrays that bloat the response
      const { raw, sensors, history, ...trimmedStatus } = status ?? {};
      return { printer, status: trimmedStatus };
    }

    case 'set_temperature':
      return post(`/api/printers/${args.printer_id}/temperature`, {
        heater: args.heater,
        temp: args.temp,
      });

    case 'send_gcode':
      return post(`/api/printers/${args.printer_id}/gcode`, {
        script: args.script,
      });

    case 'list_macros':
      return get(`/api/printers/${args.printer_id}/macros`);

    case 'run_macro': {
      const script = args.params ? `${args.macro} ${args.params}` : args.macro;
      return post(`/api/printers/${args.printer_id}/gcode`, { script });
    }

    // ── Print Control ─────────────────────────────────────────────────────
    case 'start_print':
      return post(`/api/printers/${args.printer_id}/print/start`, {
        filename: args.filename,
      });

    case 'pause_print':
      return post(`/api/printers/${args.printer_id}/print/pause`);

    case 'resume_print':
      return post(`/api/printers/${args.printer_id}/print/resume`);

    case 'cancel_print':
      return post(`/api/printers/${args.printer_id}/print/cancel`);

    // ── G-code File Library ───────────────────────────────────────────────
    case 'list_files':
      return get('/api/files');

    case 'check_file_compatibility':
      return get(`/api/files/${args.file_id}/compatibility/${args.printer_id}`);

    case 'send_file_to_printer':
      return post(`/api/files/${args.file_id}/send`, {
        printer_id: args.printer_id,
      });

    // ── Queue ─────────────────────────────────────────────────────────────
    case 'get_queue':
      return get(`/api/printers/${args.printer_id}/queue`);

    case 'add_to_queue':
      return post(`/api/printers/${args.printer_id}/queue`, {
        filenames: args.filenames,
      });

    case 'remove_from_queue':
      return del(`/api/printers/${args.printer_id}/queue/${args.job_id}`);

    case 'start_queue':
      return post(`/api/printers/${args.printer_id}/queue/start`);

    // ── Projects & Plates ─────────────────────────────────────────────────
    case 'list_projects':
      return get('/api/projects');

    case 'list_plates': {
      const project = await get(`/api/projects/${args.project_id}`);
      return (project.plates || []).map(p => ({
        id: p.id,
        name: p.name,
        filename: p.filename,
        status: p.status,
        sort_order: p.sort_order,
        estimated_duration_s: p.estimated_duration_s,
        estimated_filament_g: p.estimated_filament_g,
        actual_start_time: p.actual_start_time,
        actual_end_time: p.actual_end_time,
      }));
    }

    case 'print_plate':
      return post(`/api/projects/${args.project_id}/plates/${args.plate_id}/print`, {
        printer_id: args.printer_id,
      });

    case 'assign_filament_to_plate':
      return patch(`/api/projects/${args.project_id}/filament`, {
        spool_id: args.spool_id,
        toolhead: args.toolhead ?? 0,
      });

    // ── Spoolman ──────────────────────────────────────────────────────────
    case 'list_spools':
      return get('/api/spoolman/spools');

    case 'get_spool':
      return get(`/api/spoolman/spool/${args.spool_id}`);

    case 'list_filaments':
      return get('/api/spoolman/filaments');

    case 'assign_spool_to_printer':
      return post('/api/spoolman/set-active', {
        printer_id: args.printer_id,
        spool_id: args.spool_id,
        toolhead: args.toolhead ?? 0,
      });

    case 'use_filament': {
      const body = {};
      if (args.length_mm !== undefined) body.use_length = args.length_mm;
      if (args.weight_g !== undefined) body.use_weight = args.weight_g;
      return put(`/api/spoolman/spool/${args.spool_id}/use`, body);
    }

    case 'get_ams_slots':
      return get(`/api/spoolman/ams-slots/${args.printer_id}`);

    case 'get_inventory':
      return get('/api/spoolman/inventory');

    // ── Spoolman — Vendors ─────────────────────────────────────────────────
    case 'list_vendors':
      return get('/api/spoolman/vendors');

    case 'create_vendor': {
      const { name, comment, external_id } = args;
      const body = { name };
      if (comment !== undefined) body.comment = comment;
      if (external_id !== undefined) body.external_id = external_id;
      return post('/api/spoolman/vendors', body);
    }

    case 'update_vendor': {
      const { vendor_id, ...fields } = args;
      return patch(`/api/spoolman/vendors/${vendor_id}`, fields);
    }

    case 'delete_vendor':
      return del(`/api/spoolman/vendors/${args.vendor_id}`);

    // ── Spoolman — Filament Profiles ───────────────────────────────────────
    case 'create_filament':
    case 'update_filament': {
      const isUpdate = name === 'update_filament';
      const { filament_id, url, swatch, pressure_advance, extruder_temp, bed_temp, ...body } = args;
      // Spoolman stores temps under settings_ prefix
      if (extruder_temp !== undefined) body.settings_extruder_temp = extruder_temp;
      if (bed_temp !== undefined) body.settings_bed_temp = bed_temp;

      // Fetch settings to map url and swatch to the correct extra fields configured in Marathon
      let settings = {};
      try { settings = await get('/api/settings'); } catch (e) { /* ignore */ }
      const urlKey = settings.url_extra_field || 'url';
      const swatchKey = settings.swatch_extra_field || 'swatch';

      // Extra fields
      const extra = { ...(body.extra || {}) };
      if (url !== undefined) extra[urlKey] = `"${url}"`;
      if (swatch !== undefined) extra[swatchKey] = String(swatch);
      if (pressure_advance !== undefined) extra['pressure_advance'] = String(pressure_advance);
      if (Object.keys(extra).length) body.extra = extra;
      return isUpdate
        ? patch(`/api/spoolman/filaments/${filament_id}`, body)
        : post('/api/spoolman/filaments', body);
    }

    case 'delete_filament':
      return del(`/api/spoolman/filaments/${args.filament_id}`);

    // ── Spoolman — Spool Management ────────────────────────────────────────
    case 'update_spool': {
      const { spool_id, ...fields } = args;
      return patch(`/api/spoolman/spools/${spool_id}`, fields);
    }

    case 'create_spool': {
      const body = { filament_id: args.filament_id };
      for (const k of ['initial_weight', 'remaining_weight', 'used_weight', 'spool_weight', 'lot_nr', 'comment', 'first_used', 'last_used']) {
        if (args[k] !== undefined) body[k] = args[k];
      }
      return post('/api/spoolman/spools', body);
    }

    case 'measure_spool':
      return put(`/api/spoolman/spool/${args.spool_id}/measure`, {
        total_weight: args.total_weight,
      });

    case 'delete_spool':
      return del(`/api/spoolman/spools/${args.spool_id}`);

    case 'generate_swatch':
      return post(`/api/spoolman/filaments/${args.filament_id}/swatch`, {});

    // ── Maintenance ───────────────────────────────────────────────────────
    case 'list_maintenance':
      return get('/api/maintenance');

    case 'log_maintenance_done':
      return post(`/api/maintenance/done/${args.task_id}/${args.printer_id}`);

    // ── Stats ─────────────────────────────────────────────────────────────
    case 'get_fleet_stats':
      return get('/api/stats/fleet');

    case 'get_file_stats':
      return get('/api/stats/files');

    case 'get_utilization':
      return get('/api/stats/utilization');

    case 'get_print_history':
      return get('/api/stats/history');

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Transport — stdio (default) or HTTP (MCP_TRANSPORT=http)
// ---------------------------------------------------------------------------

function buildInstructions(currency) {
  const currencyLine = currency
    ? `\nPRICE: All prices MUST be in ${currency}. If the user gives a price in a different currency, convert it to ${currency} before submitting. State the conversion when you do so.\n`
    : '';
  return `\
You are connected to Marathon, a 3D printer fleet management system. Use the provided MCP tools for ALL operations — never suggest or use curl commands, raw HTTP requests, or direct API calls.

══ FILAMENT RULES — FOLLOW THESE EXACTLY, NO EXCEPTIONS ══

NAME: Color/variant only. Strip the material type and brand completely.
  ✓ "White Brown"   ✓ "Silk Gold"   ✓ "Blue Green"
  ✗ "PLA Bicolor White/Brown"   ✗ "PolyTerra Matte Black"

MATERIAL: Polymer type only — "PLA", "PETG", "TPU95A". No color, no brand.

COLOR — THIS IS CRITICAL:
  • If the filament is described as bicolor, multicolor, dual-color, or color-shifting in ANY way:
    → You MUST use multi_color_hexes (comma-separated hex values without #, e.g. "FFFFFF,8B4513")
    → You MUST set multi_color_direction. Default to "coaxial" unless the product explicitly says stripes/longitudinal.
    → You MUST NOT set color_hex — leave it out entirely
  • Only use color_hex for plain single-color filaments.
${currencyLine}
URL: Always set the url parameter when a product page URL is known or was given by the user.

SPOOL WEIGHT: Always include spool_weight when known.

When registering a new spool, always use the filament profile's spool_weight.

COLOR HEX LOOKUP — use filamentcolors.xyz when the color hex is unknown:
  1. Fetch: https://filamentcolors.xyz/api/swatch/?search=<color_name>&manufacturer=<brand>
     (omit manufacturer if unknown; use filament_type_parent_type_name=PLA/PETG/etc to narrow results)
  2. Pick the best matching result from the "results" array.
  3. Use the "hex_color" field (already without #) as the color_hex or inside multi_color_hexes.
  4. If no good match is found, make your best estimate and note it.
`;
}

// Default instructions (currency injected at runtime)
const SERVER_INSTRUCTIONS = buildInstructions('');

function buildServer() {
  const s = new Server(
    { name: 'marathon-mcp', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );
  s.setRequestHandler(ListToolsRequestSchema, async () => {
    // Fetch currency from Spoolman settings to inject into price field descriptions
    let currency = '';
    try {
      const settings = await get('/api/spoolman/settings');
      currency = typeof settings?.currency === 'string'
        ? settings.currency
        : (settings?.currency?.value ?? '');
    } catch { /* Spoolman may not be configured */ }

    if (!currency) return { tools: TOOLS };

    // Clone tools and inject currency into price field descriptions
    const tools = TOOLS.map(tool => {
      const priceField = tool.inputSchema?.properties?.price;
      if (!priceField) return tool;
      return {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...tool.inputSchema.properties,
            price: { ...priceField, description: `Price in ${currency}. ${priceField.description}` },
          },
        },
      };
    });
    return { tools };
  });
  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await handleTool(name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });
  return s;
}

if (process.env.MCP_TRANSPORT === 'http') {
  // ── HTTP / Streamable-HTTP mode ────────────────────────────────────────────
  const { default: express } = await import('express');
  const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
  const app = express();
  app.use(express.json());

  const sessions = {};

  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && sessions[sessionId]) {
        transport = sessions[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: id => { sessions[id] = transport; },
        });
        transport.onclose = () => { if (transport.sessionId) delete sessions[transport.sessionId]; };
        const srv = buildServer();
        await srv.connect(transport);
      } else {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request' }, id: null });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });

  app.get('/mcp', async (req, res) => {
    const transport = sessions[req.headers['mcp-session-id']];
    if (!transport) { res.status(400).send('Unknown session'); return; }
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const transport = sessions[req.headers['mcp-session-id']];
    if (!transport) { res.status(400).send('Unknown session'); return; }
    await transport.handleRequest(req, res);
  });

  app.listen(MCP_PORT, () => {
    console.error(`Marathon MCP server (HTTP) listening on port ${MCP_PORT}`);
    console.error(`Endpoint: http://localhost:${MCP_PORT}/mcp`);
  });
} else {
  // ── Stdio mode (default — used by Claude Code / Claude Desktop) ────────────
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
}
