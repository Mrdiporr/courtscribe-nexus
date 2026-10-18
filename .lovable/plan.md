# Recording and transcription failure recovery

## Outcome and scope
Preserve saved content, expose failures and provide explicit recovery. This is a proposed fix plan; implementation awaits approval. **Baseline: 20 tests pass**, covering status and sync conflicts—not recording/transcription recovery. Live failure and hosted checks remain unverified. Latest automatic build: **OK**.

## Confirmed gaps
- Recording auto-starts; stale state, buffer clearing and cleanup risk lost audio.
- Stop navigates before final persistence; writes acknowledge requests, not commits, and can overwrite chunks.
- Transcription claims completion before local saving.
- Interrupted requests lack deadlines; races/database errors bypass deduplication.
- Transient/malformed responses lack reliable recovery.

## Acceptance criteria: recording
Each criterion becomes a named test with controlled failures and concrete assertions.

| ID | Given / when | Required outcome and recovery |
|---|---|---|
| R1 Explicit start | Open, reload or revisit a valid recording page; then press Start twice rapidly. | No microphone request before Start. At most one stream and recorder after Start. Missing sessions cannot start. Recovery always requires a fresh user action. |
| R2 Startup failure | Permission denied, microphone unavailable, unsupported recording format, or session activation write rejected. | Not shown as recording; all acquired tracks released; no false saved claim. Explain the failure safely. After correcting permission/device/storage, Start can be retried without losing earlier chunks. |
| R3 Periodic persistence | Capture for 30 seconds; delay the chunk write while further audio arrives. | The batch commits exactly once; arriving audio belongs to the next batch. Saved bytes remain in order without duplication or gaps. Capture requires no network. |
| R4 Storage failure | Reject a chunk transaction through quota, error or abort. | No saved acknowledgement before transaction commit. Stop capture safely, keep the failed batch in memory, preserve committed chunks and show Retry save plus audio download recovery. Retry commits the same batch once; recording resumes only explicitly. |
| R5 Finalization | Stop while final data delivery and writes are delayed; also test rejection. | Review navigation and closed status wait for final data and all commits. On failure, remain on the recovery screen and keep pending bytes available. Retry save/finalization cannot duplicate audio. |
| R6 Interruption | End a microphone track, hide the page, navigate away, or reload after committed chunks. | Stop foreground capture and release tracks when events are available. Recover already committed chunks in order; distinguish an interrupted session from a clean stop. Opening recovery never restarts capture. Do not claim unsaved bytes survived a hard process kill. |
| R7 Append-only recovery | Restart capture explicitly for a session with existing chunks; attempt a duplicate chunk write. | Start after the last stored index, never overwrite saved audio. Duplicate insertion fails visibly. Replay/export preserves the exact committed byte sequence. |
| R8 Annotation failure | Reject a marker, note or adjournment save. | No success notification; retain editable input and offer retry. Annotation failure neither stops valid capture nor changes saved audio. |

**Honest limit:** abrupt browser/OS termination can lose audio since the last committed batch (normally up to 30 seconds; potentially longer during a stalled write). Memory-only recovery cannot survive a killed tab. Recovery messages must distinguish saved, pending and unavailable audio.

## Acceptance criteria: transcription

| ID | Given / when | Required outcome and recovery |
|---|---|---|
| T1 Consent and preflight | AI disabled, consent declined, browser offline, no audio, unsupported format, audio under 1,024 bytes or above 25 MiB. | No transcription invocation. Show the applicable safe reason. Preserve audio and existing transcript. Going online alone must not send audio; the user explicitly retries/confirms. |
| T2 Authentication | Expired or missing session returns 401. | No success status or transcript replacement. Ask the user to sign in; retry uses the same recording and renewed explicit intent. |
| T3 Network/service failure | Disconnect, timeout, or return 502/503 during a request. | Finish in a recoverable failed state, preserve existing content, and show a bounded safe error. Manual retry uses the same payload identity. Proposed provider timeout: 90 seconds. No unlimited automatic retries. |
| T4 Busy/rate limited | Return 409 or 429 with Retry-After: 5. | Retry remains unavailable for 5 seconds, then becomes available. One click starts at most one request; attempts increment. Never retry in a loop or bypass consent. |
| T5 Duplicate/mismatched input | Submit identical audio concurrently, retry completed audio, or reuse a supplied key for different bytes. | At most one provider call for identical user/payload/language identity. Completed requests reuse cached output. Different bytes cannot receive another payload's cached result. Claim conflicts re-read the winner; claim storage failure prevents provider invocation. |
| T6 Interrupted request | Reload during local queued/in-flight status; simulate a crashed server request. | Local status becomes Interrupted / Retry available rather than claiming a live request indefinitely. Server requests hold a proposed 120-second lease; no takeover before expiry, one atomic claimant after expiry. Completion is conditional on that claimant, so an older worker cannot overwrite it. Retry before expiry respects the busy cooldown. |
| T7 Invalid responses | Provider returns malformed JSON, missing text, invalid segment timestamps, or a known database operation fails. | Safe non-success response; never display/store invalid output. Mark failed when database access allows; otherwise lease expiry supplies recovery. No raw provider/database details in user-visible errors. |
| T8 Local save failure | Receive a valid result, then abort the local transcript transaction. | Show Received, not saved—not Completed. Retain result in the open page and offer Retry save and download; retry save does not invoke AI again. Existing durable transcript remains unchanged. Reload may reuse the server's cached result through an explicit retry. |
| T9 Durable success | Valid result and local transaction commit succeed; navigate away, reload, reopen review. | Only then report completion/deduped success. Text and segments read back from IndexedDB identically, remain attached to the case/session, and retain accurate sync-pending metadata. |
| T10 Review read failure | Reject session/audio/transcript loading or use a missing session. | Show failure/not-found rather than an endless loading state. Retry load restores committed content without starting recording or sending audio. |

Timings are proposed defaults. No scheduling assumptions, auto-recording, background transcription or consent-policy changes.

## Fix strategy — technical details
1. Serialize recorder writes: detach batches, retain failures, use append-only inserts and monotonic indices, and await final data plus transaction commit. Stable teardown refs replace state-dependent cleanup. Handle track loss/visibility and preserve actual MIME types across replay, export, sync and transcription.
2. Replace auto-start with explicit Start; guard duplicate actions and finalization navigation. Expose recovery controls and handle annotation/load errors. Recover interrupted sessions without auto-resuming.
3. Validate transcription input/output, serialize invocation, classify safe errors, count attempts and implement manual retry/cooldown. Separate received output from durable success; recover stale status after reload.
4. Derive service identity from audio/options; atomically claim with lease and attempt token. Check database results, remove soft-fail dedupe, bound provider execution and catch errors. Use an additive migration with owner-scoped access and grants, following project database rules.
5. Preserve case organization, sync conflict outcomes, private storage and consent. Record structural decisions in AGENTS.md.

## Execution and regression safeguards
1. Add failing tests using Vitest, fake IndexedDB and controlled recorder/track/network doubles. Exercise real hook/page orchestration and transaction aborts. Add a stable test command.
2. Implement recorder/durability and recovery controls; run R1–R8 and existing tests.
3. Implement transcription persistence/status/retry; run T1–T4 and T8–T10 plus existing tests.
4. Test concurrency, lease expiry, stale completion and provider errors with a controlled clock. Check migration compatibility before deploying; test T5–T7 with mocked provider failures.
5. Browser verification: sign in, explicitly record deterministic test audio offline across a chunk boundary, stop, replay, transcribe with consent and reopen review to read back content. Exercise recovery. Distinguish mocked checks from one explicitly authorized live hosted transcription.
6. Run all tests, inspect automatic build/browser errors and check exports, case listing, sync consent and desktop/narrow layouts.

## Release gate and rollback
- Require passing new/existing tests, clean automatic build and real UI read-back of saved audio/transcript.
- Report verified checks and blockers; zero breakage cannot be guaranteed.
- No destructive migrations/deletion. Use compatible additions; hold release on failure and restore prior app/function behavior without removing user data. No automatic publishing.

## Deliverables after approval
Recovery fixes/tests mapped to R1–R8 and T1–T10; a verification report distinguishing mocked, browser and hosted checks.