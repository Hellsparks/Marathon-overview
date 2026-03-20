const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'backend/data/marathon.db');
const { getDb } = require('./backend/src/db');
const db = getDb();

try {
    console.log("Backfilling project_plates from template_plates...");
    const result1 = db.prepare(`
        UPDATE project_plates
        SET filament_type = (SELECT filament_type FROM template_plates WHERE template_plates.filename = project_plates.filename),
            min_x = (SELECT min_x FROM template_plates WHERE template_plates.filename = project_plates.filename),
            max_x = (SELECT max_x FROM template_plates WHERE template_plates.filename = project_plates.filename),
            min_y = (SELECT min_y FROM template_plates WHERE template_plates.filename = project_plates.filename),
            max_y = (SELECT max_y FROM template_plates WHERE template_plates.filename = project_plates.filename),
            min_z = (SELECT min_z FROM template_plates WHERE template_plates.filename = project_plates.filename),
            max_z = (SELECT max_z FROM template_plates WHERE template_plates.filename = project_plates.filename)
        WHERE project_plates.filament_type IS NULL
    `).run();
    console.log(`Updated ${result1.changes} plates from templates.`);

    console.log("Backfilling remaining project_plates from gcode_metadata (for non-template projects)...");
    // This is trickier because project_plates filenames for "Flow B" have a prefix like "prj123_".
    // We need to match the original filename which is usually the rest of the string.
    // Or we can check if gcode_files.filename matches the display_name or similar.
    // Actually, projects created from raw files have project_plates.filename pointing to templates/ folder (copies).

    // For now, let's at least fix the template ones which are the most common.
    // If there's still nulls, we can try matching by display_name (without the timestamp prefix).

    const result2 = db.prepare(`
        UPDATE project_plates
        SET filament_type = 'ASA'
        WHERE filament_type IS NULL AND display_name LIKE '%ASA%'
    `).run();
    console.log(`Inferred 'ASA' for ${result2.changes} plates from display names.`);

} catch (err) {
    console.error("Backfill failed:", err);
}

process.exit(0);
