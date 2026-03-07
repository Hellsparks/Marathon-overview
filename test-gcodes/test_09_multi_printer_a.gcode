; Marathon Test Print #09 — Multi-Printer Test A
; Purpose: send to Printer 1 simultaneously with test_10 on Printer 2
; Verifies that concurrent prints on different printers are both tracked
; Duration: ~10 seconds

M117 Multi-Printer Test A
G4 P5000
M117 Multi-Printer Test A - Half
G4 P5000
M117 Multi-Printer Test A - Done
