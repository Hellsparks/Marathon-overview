; Marathon Test Print #04 — Cancel Mid-Print
; Purpose: verify a cancelled print is logged with status='cancelled'
; Instruction: start this print, then cancel it from the UI before it finishes
; Duration: 30 seconds (cancel before it completes)

M117 Marathon Test 04 - Cancel me
G4 P10000
M117 Marathon Test 04 - 10s elapsed
G4 P10000
M117 Marathon Test 04 - 20s elapsed
G4 P10000
M117 Marathon Test 04 - Should be cancelled by now
