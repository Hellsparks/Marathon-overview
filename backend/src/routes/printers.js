const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { pollAll } = require('../services/poller');
const bambuManager = require('../services/bambuManager');

const VALID_FIRMWARE_TYPES = ['moonraker', 'octoprint', 'duet', 'bambu'];

// GET /api/printers
router.get('/', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers ORDER BY sort_order, name').all();
  res.json(printers.map(normalizePrinter));
});

// POST /api/printers
router.post('/', (req, res) => {
  const {
    name, host, api_key = null,
    bed_width = null, bed_depth = null, bed_height = null,
    filament_types = '[]', toolhead_count = 1, preset_id = null,
    custom_css = null, theme_mode = 'global',
    firmware_type = 'moonraker',
    serial_number = null,
    scrape_css_path = null,
  } = req.body;

  const port = req.body.port ?? defaultPort(firmware_type);

  if (!name || !host) {
    return res.status(400).json({ error: 'name and host are required' });
  }
  if (!VALID_FIRMWARE_TYPES.includes(firmware_type)) {
    return res.status(400).json({ error: `firmware_type must be one of: ${VALID_FIRMWARE_TYPES.join(', ')}` });
  }

  const db = getDb();
  const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM printers').get().n;
  const result = db.prepare(
    `INSERT INTO printers (name, host, port, api_key, bed_width, bed_depth, bed_height, filament_types, toolhead_count, preset_id, custom_css, theme_mode, firmware_type, serial_number, scrape_css_path, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, host, port, api_key || null,
    bed_width, bed_depth, bed_height,
    typeof filament_types === 'string' ? filament_types : JSON.stringify(filament_types),
    toolhead_count, preset_id, custom_css, theme_mode, firmware_type, serial_number || null,
    scrape_css_path || null, nextOrder
  );

  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(result.lastInsertRowid);
  pollAll();
  res.status(201).json(normalizePrinter(printer));
});

// PUT /api/printers/:id
router.put('/:id', (req, res) => {
  const { name, host, port, api_key, enabled, bed_width, bed_depth, bed_height, filament_types, toolhead_count, preset_id, custom_css, theme_mode, firmware_type, serial_number, scrape_css_path, hardened_tools } = req.body;
  if (firmware_type !== undefined && !VALID_FIRMWARE_TYPES.includes(firmware_type)) {
    return res.status(400).json({ error: `firmware_type must be one of: ${VALID_FIRMWARE_TYPES.join(', ')}` });
  }
  const db = getDb();
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  db.prepare(
    `UPDATE printers SET name=?, host=?, port=?, api_key=?, enabled=?,
     bed_width=?, bed_depth=?, bed_height=?, filament_types=?, toolhead_count=?, preset_id=?, custom_css=?, theme_mode=?, firmware_type=?, serial_number=?, scrape_css_path=?,
     hardened_tools=?,
     updated_at=datetime('now')
     WHERE id=?`
  ).run(
    name ?? printer.name,
    host ?? printer.host,
    port ?? printer.port,
    api_key !== undefined ? api_key : printer.api_key,
    enabled !== undefined ? (enabled ? 1 : 0) : printer.enabled,
    bed_width !== undefined ? bed_width : printer.bed_width,
    bed_depth !== undefined ? bed_depth : printer.bed_depth,
    bed_height !== undefined ? bed_height : printer.bed_height,
    filament_types !== undefined
      ? (typeof filament_types === 'string' ? filament_types : JSON.stringify(filament_types))
      : printer.filament_types,
    toolhead_count !== undefined ? toolhead_count : printer.toolhead_count,
    preset_id !== undefined ? preset_id : printer.preset_id,
    custom_css !== undefined ? custom_css : printer.custom_css,
    theme_mode !== undefined ? theme_mode : printer.theme_mode,
    firmware_type !== undefined ? firmware_type : (printer.firmware_type || 'moonraker'),
    serial_number !== undefined ? serial_number : printer.serial_number,
    scrape_css_path !== undefined ? (scrape_css_path || null) : printer.scrape_css_path,
    hardened_tools !== undefined
      ? (typeof hardened_tools === 'string' ? hardened_tools : JSON.stringify(hardened_tools))
      : (printer.hardened_tools || '[]'),
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  res.json(normalizePrinter(updated));
});

// PUT /api/printers/reorder — bulk update sort_order
router.put('/reorder', (req, res) => {
  const { order } = req.body; // Array of printer IDs in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of printer IDs' });

  const db = getDb();
  const update = db.prepare('UPDATE printers SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?');
  console.log(`[printers/reorder] Updating order for ${order.length} printers:`, order);
  db.exec('BEGIN');
  try {
    for (let i = 0; i < order.length; i++) {
      update.run(i, order[i]);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  const printers = db.prepare('SELECT * FROM printers ORDER BY sort_order, name').all();
  res.json(printers.map(normalizePrinter));
});

// POST /api/printers/scrape-theme
router.post('/scrape-theme', async (req, res) => {
  const { host, port, api_key, scrape_css_path } = req.body;
  const isFullUrl = /^https?:\/\//i.test(host);
  if (!host || (!isFullUrl && !port)) return res.status(400).json({ error: 'Host and port are required' });

  // Default path is the standard Mainsail custom theme location
  const cssPath = (scrape_css_path || '.theme/custom.css').replace(/^\/+/, '');

  // For full URLs (OctoEverywhere etc) use as-is.
  // For regular printers use port 80 (Mainsail/nginx web server), NOT the Moonraker API
  // port — nginx proxies /server/files/... without the per-client auth that port 7125 enforces.
  const baseUrl = isFullUrl
    ? host.replace(/\/+$/, '')
    : `http://${host}`;

  const headers = {};
  if (api_key) headers['X-Api-Key'] = api_key;

  // Helper: fetch a file from config root, returns null on 404 or HTML response
  async function fetchConfigFile(filePath) {
    try {
      const r = await fetch(`${baseUrl}/server/files/config/${filePath}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('text/html')) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  try {
    // Fetch all three sources in parallel
    const themeDir = cssPath.includes('/') ? cssPath.slice(0, cssPath.lastIndexOf('/') + 1) : '.theme/';
    const [customCss, defaultJsonText, mainsailJsonText] = await Promise.all([
      fetchConfigFile(cssPath),                   // .theme/custom.css  (or custom path)
      fetchConfigFile(`${themeDir}default.json`), // .theme/default.json  (theme defaults)
      fetchConfigFile('mainsail.json'),            // mainsail.json  (Mainsail saved UI state — RatOS stores primary here)
    ]);

    // Extract primary colour from whichever JSON source has it.
    // Priority: mainsail.json uiSettings.primary > default.json top-level primary_color
    const primary = extractPrimary(mainsailJsonText) || extractPrimary(defaultJsonText);
    const jsonCss = primary ? primaryToCss(primary) : '';

    const combined = [jsonCss, customCss].filter(Boolean).join('\n');
    if (!combined) {
      return res.status(404).json({ error: 'No theme data found on printer (.theme/custom.css, .theme/default.json, mainsail.json).' });
    }
    res.json({ css: combined });
  } catch (err) {
    console.error('[scrape-theme]', err.message);
    res.status(500).json({ error: 'Failed to connect to printer' });
  }
});

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}

// Extract a primary colour from a Mainsail JSON blob (handles multiple schema shapes)
function extractPrimary(jsonText) {
  if (!jsonText) return null;
  try {
    const cfg = JSON.parse(jsonText);
    // mainsail.json: uiSettings.primary  (RatOS and standard Mainsail saved state)
    if (cfg.uiSettings?.primary) return cfg.uiSettings.primary;
    // default.json: top-level fields used by community themes
    return cfg.primary_color || cfg.primaryColor || cfg.primary || null;
  } catch {
    return null;
  }
}

function primaryToCss(primary) {
  const rgb = hexToRgb(primary);
  return `:root {\n  --primary: ${primary};\n${rgb ? `  --v-theme-primary: ${rgb};\n` : ''}}\n`;
}

// DELETE /api/printers/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const printer = db.prepare('SELECT firmware_type FROM printers WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Printer not found' });
  // Clean up Bambu MQTT connection if applicable
  if (printer?.firmware_type === 'bambu') bambuManager.disconnect(req.params.id);
  res.json({ success: true });
});

function normalizePrinter(p) {
  return {
    ...p,
    firmware_type: p.firmware_type || 'moonraker',
    filament_types: safeJsonParse(p.filament_types),
    hardened_tools: safeJsonParse(p.hardened_tools),
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return []; }
}

// ── MMU Presets ──────────────────────────────────────────────────────

// GET /api/printers/mmu-presets
router.get('/mmu-presets', (req, res) => {
  const db = getDb();
  const presets = db.prepare('SELECT * FROM mmu_presets ORDER BY name').all();
  res.json(presets);
});

// ── Printer MMU assignments ─────────────────────────────────────────

// GET /api/printers/:id/mmus
router.get('/:id/mmus', (req, res) => {
  const printerId = parseInt(req.params.id, 10);
  const db = getDb();
  const rows = db.prepare(
    `SELECT pm.*, mp.name AS mmu_name, mp.slot_count AS default_slot_count
     FROM printer_mmus pm
     JOIN mmu_presets mp ON mp.id = pm.mmu_preset_id
     WHERE pm.printer_id = ?
     ORDER BY pm.tool_index`
  ).all(printerId);
  res.json(rows);
});

// PUT /api/printers/:id/mmus  — replace all MMU assignments for a printer
router.put('/:id/mmus', (req, res) => {
  const { mmus } = req.body; // [{ tool_index, mmu_preset_id, slot_count }]
  if (!Array.isArray(mmus)) return res.status(400).json({ error: 'mmus must be an array' });

  const printerId = parseInt(req.params.id, 10);
  const db = getDb();
  const printer = db.prepare('SELECT id FROM printers WHERE id = ?').get(printerId);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM printer_mmus WHERE printer_id = ?').run(printerId);
    const ins = db.prepare(
      'INSERT INTO printer_mmus (printer_id, tool_index, mmu_preset_id, slot_count) VALUES (?, ?, ?, ?)'
    );
    for (const m of mmus) {
      if (!m.mmu_preset_id) continue; // skip empty/cleared
      ins.run(printerId, m.tool_index ?? 0, m.mmu_preset_id, m.slot_count ?? 4);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  // Return updated list
  const rows = db.prepare(
    `SELECT pm.*, mp.name AS mmu_name, mp.slot_count AS default_slot_count
     FROM printer_mmus pm
     JOIN mmu_presets mp ON mp.id = pm.mmu_preset_id
     WHERE pm.printer_id = ?
     ORDER BY pm.tool_index`
  ).all(printerId);
  res.json(rows);
});

function defaultPort(firmwareType) {
  switch (firmwareType) {
    case 'octoprint':
    case 'duet':
      return 80;
    case 'bambu':
      return 8883;
    default:
      return 7125;
  }
}

module.exports = router;
