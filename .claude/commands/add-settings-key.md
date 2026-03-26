Add a new key to Marathon's settings table.

Settings are stored as TEXT key-value pairs in the `settings` table and read/written
via `GET /api/settings` and `PUT /api/settings`.

## Steps

1. **Add a migration** to seed the default value (use `/add-migration`):
   ```sql
   INSERT OR IGNORE INTO settings (key, value) VALUES
     ('my_new_key', 'default_value');
   ```

2. **Read the value in backend code:**
   ```js
   const { getDb } = require('../db');

   function getSetting(key, def = '') {
     try {
       const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
       return row ? row.value : def;
     } catch { return def; }
   }

   const myValue = getSetting('my_new_key', 'default_value');
   ```

3. **Save from the frontend:**
   The settings route accepts a batch PUT. From React:
   ```js
   import { saveSettings } from '../api/settings';
   await saveSettings({ my_new_key: newValue });
   ```

4. **Load in the frontend:**
   ```js
   import { getSettings } from '../api/settings';
   const settings = await getSettings();
   const myValue = settings.my_new_key ?? 'default_value';
   ```

## Naming Conventions

Settings keys use `snake_case`. Namespace by feature:
- `marathon_*` — Marathon backup settings
- `spoolman_*` — Spoolman settings
- `backup_*` — backup directory settings
- `teamster_*` — Teamster/MQTT settings

Booleans are stored as `'0'` / `'1'` (TEXT).
Numbers are stored as strings and parsed with `parseInt` / `parseFloat`.
