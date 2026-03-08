; Marathon Test Print #05 — Cancel While Paused
; Purpose: verify paused→cancelled transition is logged (this was a specific bug)
; Instruction: start, wait for "PAUSE ME" message, pause from UI, then cancel
; Duration: 20 seconds before pause window

M117 Marathon Test 05 - Pause then cancel
G4 P8000
M117 Marathon Test 05 - PAUSE ME NOW
G4 P12000
M117 Marathon Test 05 - Too late to cancel from pause
