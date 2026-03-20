; Marathon Test Print #01 — Quick Complete
; Purpose: verify that a completed print is logged in gcode_print_jobs with status='complete'
; Duration: ~5 seconds
; Safe: no homing, no heaters, no actual extrusion

M117 Marathon Test 01 Start
G91                          ; Relative positioning
G1 Z1 F600                   ; Tiny Z lift (safe on any printer)
G1 Z-1 F600                  ; Return
G90                          ; Back to absolute
G4 P3000                     ; Dwell 3 seconds
M117 Marathon Test 01 Done
