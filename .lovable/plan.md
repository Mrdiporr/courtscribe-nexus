# Recording and transcription failure recovery

## Outcome and scope
Make failures visible, preserve saved audio and transcript edits, and provide an explicit recovery action for each failure. Add automated acceptance tests before changing failure behavior.

This is the proposed fix and execution plan, not a claim that fixes are implemented. Existing baseline: **20 tests passed across three files**. Those tests cover status helpers and sync conflicts, not recording lifecycle or full transcription recovery. No live failure reproduction or hosted-function tests have been performed yet.

## Confirmed gaps
- Recording starts when the recording page opens, contrary to the explicit-start requirement.
- The recorder's periodic save reads stale recording state; asynchronous buffer clearing can discard new audio. Cleanup runs when recording state changes and can stop newly acquired tracks.
- Stop does not await final audio persistence before closing the session and navigating away. Audio writes report request success rather than transaction completion, and use replacement writes despite the append-only requirement.
- Transcription reports completion before local storage succeeds. Storage failures can leave a displayed transcript that disappears on reload.
- Interrupted transcription statuses and server-side pending requests have no recovery deadline. Duplicate claims and database errors can bypass deduplication.
- Transient failures have no clear retry/cooldown path; malformed provider responses can leave requests stuck.

## Acceptance criteria: recording
Every criterion below becomes a named test with controlled failures and concrete assertions.

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

These timings are proposed implementation defaults. No new scheduling assumptions, automatic recording, background transcription submission, or changes to consent policy are included.

## Fix strategy — technical details
1. **Recorder and local durability:** introduce a small serialized recording write queue; detach batches before awaiting persistence, retain failed batches, and await final data plus transaction completion. Audio uses append-only inserts and monotonic indices. Add explicit lifecycle states for starting, recording, saving, recovery and interruption; teardown uses stable refs rather than recording-state effect cleanup. Handle track loss and visibility changes. Use supported MIME formats consistently through replay, export, sync and transcription instead of relabeling bytes.
2. **Recording page:** replace mount auto-start with explicit Start; disable duplicate actions during start/stop/save; navigate only after successful finalization. Add safe recovery actions and catch annotation/load failures. Recover stale active sessions from committed chunks, never by auto-resuming.
3. **Transcription client/local storage:** validate input and response, serialize invocation, categorize safe failures, count attempts and expose manual Retry with cooldown. Separate received output from committed transcript success. Handle persistence errors and stale status across reload; consent gates remain authoritative.
4. **Transcription service:** derive identity from actual audio plus relevant request options; atomically claim requests with a bounded lease and attempt token. Check every database result, remove soft-fail dedupe, bound provider execution, validate responses and handle exceptions. Lease/claim logic requires an additive application migration with owner-scoped access and explicit grants, reviewed under the project's database rules before implementation.
5. **No broad rewrite:** preserve case organization, existing transcript/speaker conflict outcomes, private audio storage paths and offline-first consent. Document introduced structural decisions in AGENTS.md during implementation.

## Execution and regression safeguards
1. Add failing acceptance tests first using existing Vitest, fake IndexedDB and controlled MediaRecorder/track/network doubles. Test real hook/page orchestration and transaction failures—not just rewritten helper logic. Add a stable test command if missing.
2. Implement durability/recorder fixes first, then the recording recovery screen. Run R1–R8 and existing 20 tests after this stage.
3. Implement transcription local persistence/status/retry fixes; run T1–T4 and T8–T10 plus existing tests.
4. Test claim concurrency, lease expiry, stale completion and provider errors in a local service harness with a controllable clock. Apply the additive migration only after compatibility checks, then deploy the function; run T5–T7 against mocked upstream failures without charging for repeated AI calls.
5. Verify the real app through the browser: sign in, explicitly start with a deterministic test audio stream, record offline across a chunk boundary, stop, replay, transcribe with consent, revisit review and read back the durable transcript. Exercise rejection/recovery controls too. Keep mocked failure coverage distinct from a real hosted transcription check; one explicitly authorized live request verifies actual service connectivity.
6. Re-run the full test suite, inspect automatic build results and browser errors, and check recording, review, exports, case listing and sync consent. Validate layout at desktop and narrow widths. Do not manually restart the app or run redundant builds.

## Release gate and rollback
- Proceed only when the acceptance tests and existing tests pass, the automatic build is clean, and the real central flow reads back saved audio/transcript through the UI.
- No guarantee that nothing can break: report precisely what was verified and any blocked hosted/browser checks.
- No destructive audio/transcript migration or deletion. Use backward-compatible request fields and additive metadata. If validation fails, hold release and restore prior application/function behavior without removing user data; retain compatible schema additions. Do not publish automatically.

## Deliverables after approval
- Implemented recovery fixes and automated acceptance tests mapped to R1–R8 / T1–T10.
- A concise verification report separating automated, mocked, browser and hosted checks, including remaining limitations.