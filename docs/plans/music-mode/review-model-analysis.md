# Reviewer model analysis (agy Neon vs Codex gpt-6.1-sol)

Sources: scratchpad `agy-*/review.md`, `agy-*/codex-review*.md`, fix-agent handback reports in the subagent transcripts, and the orchestrator messages in the session transcript.
"CE" = agy-ce (CE1-CE3 clip editing). "a20" = CE4 section edits. "a22" = CE6/CE7.
Reviews of A2, A4, A13 and A14 also ran (agy found 29, about 20 and 18 items). Their review files are not in the scratchpad (wiped by the 2026-11-22 crash). They are not in the tables. Their counts come from orchestrator messages only and are unverified.

## Per-review tables

### agy first reviews (severity, fix outcome)

| Review | Findings | bug / risk / nit | Fixed (full or part) | Rejected by fix agent | Codex: rejection unsound | Codex: rejection sound | Fix agent |
|---|---|---|---|---|---|---|---|
| agy-a8 (native piano roll) | 24 | 18 / 2 / 4 | 20 (F1-F20) | 0 (4 nits skipped, not rejected) | 0 | 0 | Sol |
| agy-a11 (web automation) | 21 | 14 / 6 / 1 | 21 (F19 only in part) | 0 | not reviewed | not reviewed | Sonnet |
| agy-ce (CE1-CE3) | 27 | 21 / 4 / 2 | about 21 (F10 and F14 partial) | 6 (F10 part, F14, F17, F21, F25, F27) | 2 (F10, F17) | 4 (F14, F21, F25, F27) | Sonnet |
| agy-a20 (CE4) | 18 | 15 / 2 / 1 | 15 (several partial) | 4 (F7, F16, F18 part 1, F10 part 2) | 4 (all four) | 0 | Sonnet |
| agy-a22 (CE6/CE7) | 20 | 15 / 4 / 1 | 16 (F13, F15, F17 partial) | 4 parts (F13 adelay, F15 slider, F17 harmony, F18) | 1 (F13 adelay) | 2 (F15 slider, F17 ordering), F18 partly sound | Sonnet |
| Total | 110 | 83 / 18 / 9 | about 93 | about 14 | 7 | 6 | |

Count notes: "fixed" for CE, a20, a22 is my count from the fix reports, so it is approximate (plus or minus 2). The a8 nits F21-F24 were skipped in round 1. Whether they were fixed later is unverified.

### Codex second reviews (grading the fix rounds)

| Review | Items graded | Closed | Not closed (fix incomplete) | New defects found | New defects confirmed by next round |
|---|---|---|---|---|---|
| codex a8 | F1-F20 | 19 | 1 (F20, velocity lane keeps Undo race) | 2 (F25 brush row, F26 beat label) | Sent to the Sol fix agent with a red test each. Final result not verified in the files. |
| codex CE | F1-F27 | 17 (incl. 3 rejections accepted) | 6 (F5, F6, F7, F8, F10, F17) plus F14 partial | 4 (F28-F31) | Assigned to the A20 agent as a follow-up. Fix report does not name them. Unverified. |
| codex a20 round 1 | F1-F18 | 6 closed, F10 part 1 closed | 7 not closed, 4 rejections unsound | 2 (F19, F20) | 2 of 2 (round 2 fixed both) |
| codex a20 round 2 | 13 items | 7 | 6 (F1, F4, F7, F12, F18, F19) | 6 (F21-F26) | 6 of 6 (round 3 fixed them, Codex round 3 closed all 6) |
| codex a20 round 3 | 13 items | 11 | 1 (F18, closes with F28) | 4 (F27-F30) | 4 of 4 (round 4 fixed with red tests) |
| codex a22 | F1-F20 | 13 | 5 not closed (F1, F2, F6, F16, F18), F13/F17 partial | 7 (F21-F27) | 7 of 7 (round 2 fixed all) |
| Total | | | | 25 | 19 confirmed, 4 unverified (CE F28-F31), 2 a8 pending |

No Codex new defect was rejected as false in any round I could read. Codex never called an agy finding false directly. Its only "false" calls were agreeing with fix-agent rejections (6, listed above).

## Totals per model

agy (Neon)
- 110 findings in 5 reviews: 83 bug, 18 risk, 9 nit.
- About 93 of 110 fixed (85 percent). About 14 rejected, 7 of which Codex called unsound, so those 7 agy findings were real.
- Findings agy got wrong or out of scope: CE F14, F21, F25, F27 (4), a22 F15 slider and F17 (2), a22 F1 sub-claim "autosave wipes music" (false per the fix agent, which found the server PATCH keeps `music`), a20 F13 sub-claim "duplicate point-ID collision" (does not reproduce). About 8 of 110, a false-positive rate of about 7 percent. Unverified: the fix agent's claims were not re-tested by me.
- No agy finding set got zero confirmed bugs, except the first a8 run (see tool failures).

Codex (gpt-6.1-sol, reasoning effort low, read-only)
- 6 second-review documents. It graded about 130 item states and found 25 new defects. At least 19 are confirmed real. 0 are known false.
- It overturned 7 of 13 fix-agent rejections (54 percent). It caught about 20 incomplete or partly wrong fixes (a8 1, CE 7, a20 14 across rounds, a22 7).
- Cost: short outputs (3-6 KB each), always static, every claim carries a concrete repro (numbers, ticks, ms).

## Strengths

agy
- Wide first sweep. It covers 18-27 areas per review across web, native, ops and agent parity in one pass.
- Finds parity gaps (web vs headless `get_state`, bridge seeds) and contract gaps (D48, D53) that code-only reviewers miss.
- Includes real concurrency and math defects: a8 freehand drag O(n) hang (fix agent measured over 2 minutes), tempo offset tick math (a20 F4, a22 F6), quantize ordering vs split/join (a22 F7-F9), controller ramp loss at loop boundaries (CE F6, a20 F10).
- High yield: about 85 percent of findings led to a code change.

Codex
- Strongest at "is this fix actually closed". It re-derives the failure and finds the next layer: a20 F1 (locked ramp with no point inside the range), a22 F16 (two notes quantized to one tick), CE F28 (unroll drops a ramp endpoint).
- Finds regression defects that the fix introduced: CE F29 (failed snap leaves doc unrolled), CE F31, a20 F22 (paste makes two undo steps), a22 F24/F25 (crossfade pairing).
- Fair arbiter. It accepted 6 rejections as sound and cited the contract text for each (D49, CE3 literal window rule). It also flagged weak tests ("constant CC7 fixture does not exercise the reported ramp", "round-two test claims controller coverage but has no controllers").
- Short and low-noise.

## Weaknesses

agy
- Tool failures: the first a8 run returned no findings because the headless mode blocked a shell command. The orchestrator added a no-shell rule and reran. One run was lost.
- Some findings are feature requests framed as bugs (a20 F16 get_state parity, a20 F18 UI range selection, CE F27 not in the op list, CE F21 harmony in repeats).
- A few claims were not checked against code (a22 F1 autosave wipe, a20 F13 duplicate IDs).
- Verbose: 18-32 KB reviews. Findings often bundle several defects (a20 F1 has four sub-bugs), so closure is hard to judge. Partial fixes follow.
- Sentence-level nits (a8 F21-F24) were skipped, so they carry no value.
- No second pass on its own findings. Needs Codex to verify closure.

Codex
- Hung about 6 hours on the CE second review: `codex exec` waited for stdin ("Reading additional input from stdin..." in each stderr file). The orchestrator reran with stdin closed. Every later run worked. Each stderr file shows reasoning effort low.
- Static only. "Fails old code" is by inspection, never by execution.
- Did not catch breadth gaps outside the fixed items. It checks what it is asked, plus a few new defects. It does not replace a first sweep.
- Some "not closed" calls are narrow edge cases (a8 F26 float tolerance, a20 F19 nonuniform scale on rotated child). These are real but small.

## Fix agents

Sol (Codex, native C++/QML)
- a8 round: 20 of 24 fixed, 25 regression tests, 73 UI plus 51 MIDI tests passed, ctest 3/3, 1 h 29 min. Zero rejections. Red-first for the tests (8 of 23 failed on old code in the A8 part 1 run).
- Only 1 of 20 fixes (F20) was incomplete. This is the best closure rate in the project.
- ad79bd7e (Sonnet fixing native C++ #4-#16) also wrote red tests, but ran a 2+ minute hang test and did not run TSan for a race fix.
- A Sol task kept running after its agent stopped and changed files, so the orchestrator cancelled it before the commit.

Sonnet (web / TS)
- Strong test discipline in some rounds (a57960a: backed up files, reverted logic by hand, 6 of 7 web tests failed red). Weak in others: a11 fix did not run new tests red ("I only confirmed that F11 and F20 fail when their fixes are removed"). CE fix wrote web store tests after the fix. CE4 round 2 "wrote the timeline fixes before the red tests, so those tests were never seen red". CE4 round 4 made one red run by re-adding old code.
- Rejection quality is the main problem: 7 of 13 rejections were unsound per Codex. Pattern: Sonnet rejects "design change" or "feature gap" items that the contract does require (a20 F7, F16, F18p1) or declines a real boundary (CE F17 known source length, a22 F13 adelay rounding, which a probe later proved real).
- Partial fixes reported as done: a20 round 1 left 7 of 18 not closed; CE round left 6 not closed.
- Process issues the orchestrator logged: CE4 round 3 started one broad Jest run (314 suites) then stopped it. CE4 round 3 and later sent the same report 4 times and had to be stopped. CE4 round 4 ran prettier on all of `TimelineStore.ts` (the orchestrator measured only about 4 whitespace-only lines changed). a22 fix used about 133 Bash calls; CE4 round 2 about 95. The agent did not rerun the full timeline package after the last test edits in round 3.
- Two GPU tests (`render.a432Browser.gpu`, `render.colorBoundary.gpu`) fail in every Sonnet report; none of them reran without the diff to prove it is environmental. Unverified.

## Recommended routing

1. First sweep review of a feature: agy. Prompt it with the contract, the diff, and a no-shell rule. Ask for one defect per finding ID so closure is checkable.
2. Second review after every fix round: Codex Sol, always. It finds the incomplete fixes and the regressions agy cannot see. Run `codex exec` with stdin closed (`< /dev/null`) and set a timeout. Ask for new defects only after the closure list.
3. Never accept a fix-agent rejection without a Codex check. Send each rejection to Codex with the contract clause. 54 percent were wrong. Reject only when Codex agrees, or when the fix agent attaches a failing-to-repro test (a22 F1 and a20 F13 are good examples).
4. Fix agents: Sol for native C++/QML (best closure, fewest rejections, red-first). Sonnet for TS/web, with these rules in the prompt: red test first for every item (show the failing line), no rejection of a contract-required behavior, fix partial items fully or list them as open, no repeated reports, no broad Jest, no prettier on whole files.
5. Do not use Codex for the first sweep. Its low-effort static pass is too narrow and agy covers 2-3x more surface.
6. Cap rounds: a20 needed 4 rounds. When a round yields fewer than 3 new Codex defects, stop. Rounds 3 and 4 found only edge cases (paste and automation hold semantics).

## Unverified numbers

- Fixed counts for CE, a20, a22 (plus or minus 2): derived from prose reports.
- Whether Sol closed a8 F20, F25, F26, and whether the a8 nits and CE F28-F31 were fixed: no confirming report read.
- Findings and outcomes for A2, A4, A13, A14 reviews: orchestrator messages only.
- Sonnet vs Sol token and time cost: only the a8 Sol run time (1 h 29 min) is known.
