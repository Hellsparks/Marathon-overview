; Marathon Test Print #10 — Multi-Printer Test B
; Purpose: send to Printer 2 simultaneously with test_09 on Printer 1
; Verifies that concurrent prints on different printers are both tracked
; Duration: ~10 seconds

M117 Multi-Printer Test B
G4 P5000
M117 Multi-Printer Test B - Half
G4 P5000
M117 Multi-Printer Test B - Done
