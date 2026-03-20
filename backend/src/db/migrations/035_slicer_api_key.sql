-- Per-printer API key for slicer integration (OrcaSlicer "Upload and Print").
-- When a slicer sends a file with this key, Marathon knows which printer to target.
ALTER TABLE printers ADD COLUMN slicer_api_key TEXT;
