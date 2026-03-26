/**
 * Shared Playwright API mock helpers.
 * Call mockAllApis(page) in beforeEach to intercept all backend calls
 * and return stable fixture data — no real backend needed.
 */

export const MOCK_PRINTERS = [
  {
    id: 1, name: 'Ender 3 Pro', host: '192.168.1.100', port: 7125,
    firmware_type: 'klipper', theme_mode: 'global', custom_css: '',
    toolhead_count: 1, enabled: 1, sort_order: 0,
  },
  {
    id: 2, name: 'X1 Carbon', host: '192.168.1.101', port: 7125,
    firmware_type: 'bambu', theme_mode: 'global', custom_css: '',
    toolhead_count: 1, enabled: 1, sort_order: 1,
  },
  {
    id: 3, name: 'Artillery SW', host: '192.168.1.102', port: 7125,
    firmware_type: 'klipper', theme_mode: 'global', custom_css: '',
    toolhead_count: 1, enabled: 1, sort_order: 2,
  },
];

export const MOCK_STATUS = {
  printers: {
    1: {
      printer: MOCK_PRINTERS[0],
      _online: true,
      print_stats: { state: 'standby', filename: '' },
      display_status: { progress: 0 },
      extruder: { temperature: 25, target: 0 },
      heater_bed: { temperature: 24, target: 0 },
    },
    2: {
      printer: MOCK_PRINTERS[1],
      _online: true,
      print_stats: { state: 'printing', filename: 'benchy.gcode' },
      display_status: { progress: 0.42 },
      extruder: { temperature: 220, target: 220 },
      heater_bed: { temperature: 65, target: 65 },
    },
    3: {
      printer: MOCK_PRINTERS[2],
      _online: false,
    },
  },
};

export const MOCK_SETTINGS = {
  spoolman_url: '',
  teamster_url: '',
  backup_dir: '',
  backup_dir_2: '',
  marathon_backup_enabled: '0',
  marathon_backup_interval: '24',
  marathon_backup_keep: '7',
  marathon_backup_include_uploads: '1',
  spoolman_backup_enabled: '0',
  spoolman_backup_interval: '24',
  spoolman_backup_keep: '7',
  spoolman_data_dir: '',
};

/**
 * Register mock routes for all API endpoints.
 * More specific routes must be registered before broader wildcards.
 */
export async function mockAllApis(page) {
  // Setup wizard — must be first to avoid redirect loop
  await page.route('**/api/setup/status', r =>
    r.fulfill({ json: { setup_completed: true } }));

  // Status (polled frequently — must respond fast)
  await page.route('**/api/status', r =>
    r.fulfill({ json: MOCK_STATUS }));

  // Spoolman — specific before wildcard
  await page.route('**/api/spoolman/services/status', r =>
    r.fulfill({ json: { spoolman: { running: false }, swatch: { running: false }, lanIp: '192.168.1.50' } }));
  await page.route('**/api/spoolman/**', r =>
    r.fulfill({ json: [] }));

  // Printers
  await page.route('**/api/printers', r =>
    r.fulfill({ json: MOCK_PRINTERS }));
  await page.route('**/api/printers/**', r =>
    r.fulfill({ json: [] }));

  // Settings
  await page.route('**/api/settings', r =>
    r.fulfill({ json: MOCK_SETTINGS }));

  // Files & folders
  await page.route('**/api/files', r =>
    r.fulfill({ json: [] }));
  await page.route('**/api/folders', r =>
    r.fulfill({ json: [] }));

  // Maintenance
  await page.route('**/api/maintenance', r =>
    r.fulfill({ json: { tasks: [], printers: [], intervals: [], history: [] } }));

  // Backup
  await page.route('**/api/backup/**', r =>
    r.fulfill({ json: { dir: '', dir2: '', defaultDir: '/data/backups', marathon: { enabled: false, files: [] }, spoolman: { enabled: false, files: [] } } }));

  // Stats
  await page.route('**/api/stats/**', r =>
    r.fulfill({ json: { total_prints: 0, total_runtime_s: 0, by_file: [] } }));

  // Misc
  await page.route('**/api/presets', r =>
    r.fulfill({ json: [] }));
  await page.route('**/api/mcp/**', r =>
    r.fulfill({ json: {} }));
  await page.route('**/api/updates/**', r =>
    r.fulfill({ json: {} }));

  // Templates & projects (files page)
  await page.route('**/api/templates', r =>
    r.fulfill({ json: [] }));
  await page.route('**/api/projects', r =>
    r.fulfill({ json: [] }));
}
