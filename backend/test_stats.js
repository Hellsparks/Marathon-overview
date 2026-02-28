const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/marathon.db');
db.exec(`
  INSERT INTO gcode_print_jobs (printer_id, filename, total_duration_s, filament_used_mm, material, status)
  VALUES (1, 'EBB36_LGX_Lite_Cover_ASA_43m37s.gcode', 2617, 12500, 'ASA', 'complete');
  
  INSERT INTO gcode_print_jobs (printer_id, filename, total_duration_s, filament_used_mm, material, status)
  VALUES (1, 'Main_Body_Voron_O2_ASA_1h10m.gcode', 4200, 24600, 'ASA', 'complete');
  
  INSERT INTO gcode_print_jobs (printer_id, filename, total_duration_s, filament_used_mm, material, status)
  VALUES (2, 'EBB36_LGX_Lite_Cover_ASA_43m37s.gcode', 2605, 12510, 'ASA', 'complete');
`);
console.log('Dummy print data inserted!');
