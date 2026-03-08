; Marathon Test Print #11 — Sequential Job A (run before #12)
; Purpose: run this, let it complete, then immediately run test_12 on the same printer
; Verifies previousStates resets cleanly between jobs (no double-logging, no stale filename)
; Duration: ~8 seconds

M117 Sequential A - Start
G4 P4000
M117 Sequential A - Half
G4 P4000
M117 Sequential A - Done (start #12 now)
