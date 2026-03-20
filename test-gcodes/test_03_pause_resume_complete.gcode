; Marathon Test Print #03 — Pause → Resume → Complete
; Purpose: verify a print that is paused and resumed is still logged correctly
; Instruction: after starting, pause the print from the UI, then resume, let it finish
; Duration: ~10 seconds (excluding pause time)

M117 Marathon Test 03 - Pause me now
G4 P8000
M117 Marathon Test 03 - Resumed OK
G4 P2000
M117 Marathon Test 03 Done
