# Report format

This page is for the coordinator. Never give it to a participant.

Write `report.md` in the run directory
(`web/agentic-qa-runs/<run>/report.md`). Refer only to files that exist.

## 1. Run contract

A table: target and build (git commit), locale, browser, viewport, persona,
model, limits, identity and data state (`seeded-demo` or `empty-new-account`),
provider mode (fake or real), auth omissions, permitted origins and actions,
and the protocol SHA-256 from `contract.json`.

## 2. First-time experience

Lead with this. For each session, in plain words:

- What the participant understood, citing screenshots (`website-discovery/S004`).
- What it attempted.
- Where confidence or progress broke down.
- Whether it reached a useful outcome, and the evidence.

## 3. Session table

Keep these fields independent. Do not merge them into one status.

| Field | Values |
|---|---|
| Session kind | `discovery`, `task`, `continuation` |
| Validity | `boundary-audited`, `unverified`, `CONTAMINATED` |
| Outcome | `completed`, `partial`, `blocked`, `safety stop`, `budget exhausted`, `not run` |
| Assistance | `unassisted`, `assisted from step N` |
| Runner outcome | `FINISHED`, `ACTION_LIMIT`, `TIME_LIMIT`, `BLOCKED_ENVIRONMENT`, `RUNNER_ERROR` |
| Actions | used / limit |
| Time | elapsed, browser time, overhead |
| Agent cost | `agentCostUsd` from `summary.json` |

The coordinator sets `Outcome` from the evidence, not from the participant's
claim. A click, spinner, toast, or participant statement is not completion.

## 4. Findings

Number them `F1`, `F2`, and so on, most severe first. Each finding has:

- **Category**: discoverability, comprehension, affordance, feedback,
  recovery, persistence, visual hierarchy, or technical breakage.
- **Evidence**: the pre-action screenshot, the action from `steps.jsonl`, and
  the post-action screenshot, or an explicit evidence gap.
- **Observed**: what the participant saw and did. Quote visible wording exactly.
  Mark uncertain readings of an image as uncertain.
- **Status**: observed, independently reproduced, proposed explanation,
  fixture artifact, or untested recommendation.
- **Diagnosis** (only after the blind record is frozen): verified source
  locations, console or network evidence from `private/`, and the difference
  between environments.
- **Regression** (for confirmed defects only): the smallest journey-suite test,
  and proof that its assertion fails on the defect.

Include successful and confusing moments, not only defects. A control that
works but that the participant could not find is still a finding.

## 5. Coverage and limitations

List sessions not run, outcome goals not attempted, and these conspicuously:
fake providers, seeded data, auth skipped, desktop only, model used for the
participant, and any contamination.

This is an agent-based usability probe, not a human study. Do not state
satisfaction scores, conversion rates, user percentages, or human timings. Use
session counts with their denominator, for example "1 of 3 sessions".
