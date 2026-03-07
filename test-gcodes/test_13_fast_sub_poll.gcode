; Marathon Test Print #13 — Sub-Poll-Interval Completion
; Purpose: print completes in ~2 seconds (less than the 3-second poll interval)
; The poller may miss the 'printing' state entirely and see standby → standby
; Expected behaviour: job may NOT be logged (known limitation of poll-based tracking)
; This test documents the boundary condition — not a bug, just a known gap
; Duration: ~2 seconds

M117 Fast test - blink
G4 P2000
M117 Fast test done
