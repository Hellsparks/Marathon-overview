; Marathon Test Print #12 — Sequential Job B (run after #11)
; Purpose: second job in back-to-back sequence on same printer
; Expected: two separate entries in gcode_print_jobs, each with correct filename
; Duration: ~8 seconds

M117 Sequential B - Start
G4 P4000
M117 Sequential B - Half
G4 P4000
M117 Sequential B - Done
