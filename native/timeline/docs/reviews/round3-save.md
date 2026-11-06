- **F1 — P1: fallback recovery files can overwrite another server’s recovery.** [AutosaveController.cpp:282](native/timeline/src/server/AutosaveController.cpp:282). Default fallback directories are shared, and filenames contain only the timeline ID. Normal backups include server/account identity at [ServerSource.cpp:136](native/timeline/src/server/ServerSource.cpp:136). Open matching timeline IDs from local and staging databases, make different edits, then quit both offline with unwritable primary backup directories. The second fallback replaces the first session’s only recovery file. **Fix:** retain server/account namespaces in fallback paths and test two targets sharing a timeline ID.

- **F2 — P2: the wrong-instance test does not establish that refusals are never retried.** [tst_autosave.cpp:577](native/timeline/tests/tst_autosave.cpp:577). It checks only that POST count stays zero. Repeated retries rejected by `/ready` also produce zero POSTs. Moreover, its HTTP 200 mismatch remains nontransient even if the explicit `WRONG_SERVER` exclusion is deleted. **Fix:** return a mismatched instance with HTTP 503, then assert that the `/ready` count remains one during the retry interval. Count the explicit quit attempt separately.

- **F3 — P3: exit-code preservation is tested only with zero.** [tst_autosave.cpp:555](native/timeline/tests/tst_autosave.cpp:555). Replacing the recovery-success branch’s `rc` with constant `0` leaves this test passing while swallowing a failed run’s exit status. The clean/null cases also supply only zero. **Fix:** use a nonzero status such as `7` and require its preservation in each successful-recovery, clean, and null-controller case.

The earlier findings have these statuses:

| Earlier finding | Status and evidence |
|---|---|
| **rv2 F1: recovery deleted after failed strip-copy replacement** | **Partly fixed.** [AutosaveController.cpp:193](native/timeline/src/server/AutosaveController.cpp:193) prevents the reported deletion. But recovery v1 → intervening edit v2 → successful save stripping that edited field → failed strip-copy write still acknowledges v2, advertises recovery v1, and skips quit recovery because the document is “clean.” See [line 175](native/timeline/src/server/AutosaveController.cpp:175), [line 206](native/timeline/src/server/AutosaveController.cpp:206), and [line 262](native/timeline/src/server/AutosaveController.cpp:262). Track whether the current snapshot is durably preserved and attempt fallback storage when it is not. |
| **rv2 F2: quit timeout measures inactivity** | **Fixed for the positive timeout used by main.** [AutosaveController.cpp:268](native/timeline/src/server/AutosaveController.cpp:268) enables the deadline. [ServerClient.cpp:175](native/timeline/src/server/ServerClient.cpp:175) shares elapsed time across preflight and POST, and the timer aborts the reply. |
| **rv2 F3: animated-flex audit accepts missing output** | **Fixed.** [tst_serverclient.cpp:357](native/timeline/tests/tst_serverclient.cpp:357) requires report sections, an explicit animated-text field entry, and a `t1` clip entry. Returning `{}` now fails. Animated layout is separately asserted at [tst_flexlayout.cpp:237](native/timeline/tests/tst_flexlayout.cpp:237). |
| **rv2 F4: property tests miss completion notifications** | **Fixed.** Final notification snapshots must contain completed state and correct properties at [tst_autosave.cpp:385](native/timeline/tests/tst_autosave.cpp:385) and [line 437](native/timeline/tests/tst_autosave.cpp:437). Earlier edit/start notifications no longer suffice. |
| **m5b F1: undo indices misidentify saved content** | **Remains fixed.** Content hashes determine dirty state at [AutosaveController.cpp:75](native/timeline/src/server/AutosaveController.cpp:75). The new assertion at [tst_autosave.cpp:202](native/timeline/tests/tst_autosave.cpp:202) also checks the clean marker. |
| **m5b F2: offline shutdown loses edits when recovery fails** | **Partly fixed.** [AutosaveController.cpp:280](native/timeline/src/server/AutosaveController.cpp:280) tries fallback directories, and [main.cpp:1148](native/timeline/src/main.cpp:1148) now propagates failure through the helper. If every directory rejects the write, shutdown still loses edits, now reporting exit code 4. |
| **m5b F4: replacement listener can receive mutation** | **Partly fixed.** [ServerClient.cpp:215](native/timeline/src/server/ServerClient.cpp:215) rejects a wrong instance already present at preflight. The takeover race remains. |
| **m5b F5: `MANIMGX_PATH` misuse** | **Remains fixed.** [scratch-server.mjs:39](native/timeline/scripts/scratch-server.mjs:39) does not restore that override. Instance identification uses its own environment variable and preload. |
| **m2b F3: banners claim nonexistent recovery** | **Previously fixed behavior remains**, with the stale-copy limitation described under rv2 F1. [SaveBanners.qml:28](native/timeline/qml/SaveBanners.qml:28) uses controller properties. However, its copy sentence trusts the newly selected recovery path without knowing whether that file contains the latest edits. |

The reported port-takeover gap is real and remains a safety defect. A legitimate `/ready` response can be followed by that listener closing and another listener receiving the POST. Checking the POST response at [ServerClient.cpp:227](native/timeline/src/server/ServerClient.cpp:227) detects the mistake after mutation. JavaScript mutation/upload checks have the same limitation at [scratch-server.mjs:186](native/timeline/scripts/scratch-server.mjs:186).

Closing it requires authenticated endpoint identity before transmitting the mutation, such as pinned TLS or a private IPC endpoint. A request token checked before dispatch protects against cooperating servers, but arbitrary replacement listeners can ignore it. Another preflight or response check cannot provide the documented “gets no write” guarantee.

Test sensitivity was checked from source, **not by executing mutants**:

| New or behavior-changed test | Broken behavior its assertions detect, or remaining gap |
|---|---|
| `saveSendsTheBaseAndCleansTheStack` | Missing successful-save clean marking. |
| `theConflictCopyIsAProperty` | Missing completion notification leaves the recorded state saving or without the conflict copy. |
| `aSuccessfulSaveClearsTheCopy` | Missing completion notification leaves the recorded recovery path stale. |
| `aRetryWithAFailedStripCopyKeepsTheRecoveryFile` | Recovery deletion and failure to remove it after a successful replacement. It misses intervening edits and stale recovery content. |
| `quitIsBoundedByAnElapsedDeadline` | Removing the elapsed deadline allows the trickled response to exceed its 2.5-second assertion. It does not exercise preflight plus POST sharing the budget. |
| `quitWithAnUnwritableFolderUsesAFallback` | Missing fallback iteration/write fails the path and JSON assertions. |
| `quitExitCodeReportsLostEdits` | Suppressing the loss exit code. It does not test the actual `main()` hookup. |
| `quitExitCodeKeepsTheRunsCodeWhenACopyIsKept` | Missing recovery file, but not lost nonzero exit status. See F3. |
| `aWrongServerInstanceIsNeverWritten` | Missing normal/quit instance enforcement, but not forbidden retries. See F2. |
| `mutateWithoutAnExpectationSendsDirectly` | Failure to POST directly or an unwanted preflight. |
| `mutateRefusesAnotherInstance`, `mutateRefusesAServerWithoutAnInstance` | Sending POST despite mismatched or missing preflight identity. |
| `mutateWritesToTheExpectedInstance` | Rejection of matching identity or incorrect GET/POST sequencing. |
| `mutateFlagsAnAnswerFromAnotherInstance` | Accepting a mismatched POST response. It does not prove mutation prevention. |
| `auditKeepsFlexTreesWithAnimatedText` | Missing report output or restored unsupported classifications. |
| Three new preload tests | Missing header injection, missing inheritance into a child, and unwanted injection without a token. The “tsx” test uses a generic child launcher, not actual `tsx`. |

Initializer-only changes to existing tests add an empty `expectedInstance` and introduce no new behavioral assertion. No added test verifies the complete `nativeEnv` → `serverSaveTarget` → client-enforcement connection.

Verified: the working tree was clean at `9794338d5d`. Using existing `build-r2` binaries with `QT_QPA_PLATFORM=offscreen`, nine selected server-client test functions passed, plus the animated layout/cache test. Qt reported **11/11** and **3/3**, including setup/cleanup, with no skips. Syntax checks passed for all four scoped scripts.

Not verified: server-backed tests, executable mutation testing, actual shutdown fault injection, port takeover, or dynamic lifetime/threading behavior. Autosave initialization itself starts a TCP server, so that suite was not run. I found no additional concrete lifetime/threading defect in the inspected changes. No files were edited, builds performed, servers started, requests sent to port 7777, visible windows opened, or sound played.