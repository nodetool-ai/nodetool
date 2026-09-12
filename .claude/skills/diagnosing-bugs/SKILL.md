---
name: diagnosing-bugs
description: "Diagnose code failures, intermittent bugs, and performance regressions. For NodeTool workflow-run failures, use nodetool-troubleshooter."
---

# Diagnosing Bugs

Find the cause of the reported symptom, fix it within the requested scope, and
retain evidence that the fix works. Read relevant code and logs to construct a
reproduction. Existing domain terms and ADRs constrain the diagnosis.

## Establish the failure

Prefer an existing harness or test that reaches the affected behavior. Otherwise
build the smallest practical test, CLI invocation, HTTP request, or browser
scenario. Read the applicable entry in the
[harness reference](../../../docs/harnesses.md) before using a harness.

Run the reproduction before changing behavior. Capture the command, exit status,
input, and observed symptom. An unrelated setup failure does not reproduce the
bug. Reduce inputs when useful, retaining the original case.

For intermittent failures, record the observed rate and conditions. Use seeded
inputs, bounded repetition, or targeted stress to improve the signal. For
performance regressions, capture a comparable timing or profiler baseline before
the fix. Avoid arbitrary repetition targets or latency requirements for the harness.

If the environment cannot reproduce the failure, continue useful code and log
inspection and label hypotheses as unverified. Request only the missing artifact
or access needed to establish the failure. Do not claim a reproduced or fixed bug
without evidence, or add production instrumentation without authorization.

## Test the cause

State a falsifiable hypothesis and the observation that would distinguish it
from plausible alternatives. Use a debugger, targeted instrumentation, or
bisection as appropriate. Change one relevant variable at a time and update the
hypothesis from the result. Do not invent extra hypotheses to meet a quota.

Tag temporary instrumentation so it can be removed. Preserve unrelated edits
when reverting an experiment.

## Fix and verify

Retain the reproduction as a regression test or runnable fixture at a boundary
that exercises the real failure. Observe it fail before the fix and pass after.
Recheck the original scenario if the retained case was reduced.

If no suitable test boundary exists, explain the limitation and retain the best
available reproduction. Do not substitute a test that cannot detect the symptom.
Report necessary architectural follow-up without starting an unrelated refactor.

Remove temporary instrumentation and files created only for the experiment.
Complete the [mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification).
Report the cause, changed behavior, and actual verification results. Stop when
the requested fix and required checks are complete.
