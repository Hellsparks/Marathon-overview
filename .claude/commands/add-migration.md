Add a new database migration to Marathon.

## Steps

1. Find the highest existing migration number:
   ```bash
   ls backend/src/db/migrations/ | sort | tail -5
   ```

2. Create the next migration file:
   `backend/src/db/migrations/NNN_<short_description>.sql`
   where NNN = previous highest + 1 (zero-padded to 3 digits).

3. Write the migration SQL. Common patterns:

   **New table column:**
   ```sql
   ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;
   ```

   **New settings keys:**
   ```sql
   INSERT OR IGNORE INTO settings (key, value) VALUES
     ('key_name', 'default_value'),
     ('key_name_2', '0');
   ```

   **New table:**
   ```sql
   CREATE TABLE IF NOT EXISTS table_name (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ...
   );
   ```

4. Migrations run automatically on backend startup via `backend/src/db/index.js`.
   No need to register them anywhere — the runner picks up all `.sql` files in order.

5. If adding settings keys, also use `/add-settings-key` to document the key.

## Notes
- Always use `IF NOT EXISTS` / `OR IGNORE` — migrations must be idempotent.
- SQLite doesn't support `ADD COLUMN IF NOT EXISTS` — wrap in a try/catch if needed, or check `pragma table_info`.
- After adding, run `/run-tests` to verify the migration doesn't break existing tests.
