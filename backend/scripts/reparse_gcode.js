const { getDb } = require('../src/db');
const { parseGcodeFile } = require('../src/services/gcodeParser');

async function reparse() {
    const db = getDb();
    const files = db.prepare('SELECT id, filename FROM gcode_files').all();

    for (const file of files) {
        console.log(`Reparsing ${file.filename}...`);
        try {
            const meta = await parseGcodeFile(file.filename);
            if (meta) {
                db.prepare(
                    `INSERT OR REPLACE INTO gcode_metadata (file_id, min_x, max_x, min_y, max_y, min_z, max_z, filament_type, estimated_time_s, sliced_for)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(file.id, meta.min_x, meta.max_x, meta.min_y, meta.max_y, meta.min_z, meta.max_z, meta.filament_type, meta.estimated_time_s, meta.sliced_for);
                console.log(`  -> Sliced for: ${meta.sliced_for || 'Unknown'}`);
            }
        } catch (e) {
            console.error(`Error parsing ${file.filename}: ${e.message}`);
        }
    }
}

reparse();
