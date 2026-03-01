const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'backend/data/marathon.db');
const { getDb } = require('./backend/src/db');
const db = getDb();
console.log("--- project_plates ---");
const plates = db.prepare("SELECT id, display_name, filament_type, min_x, max_x, min_y, max_y, min_z, max_z FROM project_plates").all();
console.table(plates);

console.log("\n--- printers ---");
const printers = db.prepare("SELECT id, name, filament_types FROM printers").all();
console.table(printers);
process.exit(0);
