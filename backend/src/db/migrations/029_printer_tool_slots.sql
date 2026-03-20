-- 029_printer_tool_slots.sql
-- Per-tool spool assignments for multi-toolhead Klipper printers.
-- Same pattern as ams_slots (used for Bambu AMS).
CREATE TABLE IF NOT EXISTS printer_tool_slots (
    printer_id  INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    tool_index  INTEGER NOT NULL,  -- 0 = T0, 1 = T1, etc.
    spool_id    INTEGER,           -- NULL = empty slot
    PRIMARY KEY (printer_id, tool_index)
);
