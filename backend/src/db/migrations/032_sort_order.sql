-- Persistent printer card ordering + per-tool hardened nozzle tracking

ALTER TABLE printers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill sort_order to match current alphabetical ordering
UPDATE printers SET sort_order = (
  SELECT COUNT(*) FROM printers p2
  WHERE p2.name < printers.name OR (p2.name = printers.name AND p2.id < printers.id)
);

-- JSON array of tool indices with hardened nozzles, e.g. [0, 2]
-- Gives per-tool granularity for abrasive filament warnings
ALTER TABLE printers ADD COLUMN hardened_tools TEXT NOT NULL DEFAULT '[]';

-- Migrate: if printer was marked abrasive_capable, mark tool 0 as hardened
UPDATE printers SET hardened_tools = '[0]' WHERE abrasive_capable = 1;
