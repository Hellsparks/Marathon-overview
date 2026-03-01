const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'backend/data/marathon.db');
const { getDb } = require('./backend/src/db');
const db = getDb();
console.log("--- template_plates ---");
const plates = db.prepare("SELECT id, display_name, filament_type FROM template_plates").all();
console.table(plates);
process.exit(0);
