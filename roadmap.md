# Recording and transcription reliability

- [x] Define testable failure acceptance criteria and expected recovery behavior.
- [x] Produce a scoped fix and execution plan with regression safeguards for approval.
- [x] Complete recorder lifecycle/UI and transcription recovery fixes and remaining acceptance tests.
- [x] Add append-only audio writes, transaction-commit acknowledgement and tested retryable write queue.
- [ ] Verify recording/transcription flows in the browser (Playwright) and against the hosted transcribe function.

Done this round: explicit Start replacing auto-start, recording write queue wired into the recorder
(append-only, retryable failed batches, interruption handling), explicit resume-after-interruption
recovery UI, transcript received-not-saved recovery with retry save, stale transcription statuses
reconciled to Interrupted after reload, safe error messages. Build OK; 24 tests pass.
