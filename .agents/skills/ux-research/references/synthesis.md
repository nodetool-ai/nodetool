# Observation, synthesis, and follow-up

This page is for the researcher. Never give it to a participant.

The study moves from raw record to decision in four steps: observation notes
per session, affinity clusters across sessions, insights with severity, and a
follow-up for each insight. Each step cites the one before it, so any
recommendation traces back to screenshots.

## Observation notes

Write `notes/<session>.md` in the study's run directory. One note is one
observation. Do not interpret yet.

```markdown
| ID | Task | Step | Screenshot | Type | Observation |
|---|---|---|---|---|---|
| P2-07 | T1 | 4 | S004 | misread | Clicked "Templates" expecting a blank document. Diary: "I thought templates would be the start page." |
| P2-08 | T1 | 5 | S005 | backtrack | Pressed Back from the template gallery. |
```

Types:

| Type | Meaning |
|---|---|
| `expectation` | The participant said what it expected before acting. |
| `misread` | It read a label, icon, or message differently from what it does. |
| `hesitation` | It looked at a control or area and did not act, or said it was unsure. |
| `wrong-place` | It looked for something where it is not. |
| `backtrack` | It undid a navigation or reversed a choice. |
| `success` | It completed a step and the diary shows it understood why. |
| `lucky` | It completed a step but the diary shows a guess or a wrong reason. |
| `quote` | A diary line worth keeping as it is. |
| `defect` | Something broke, such as an error, garbled text, or a wrong state. These go to the report's defects list, not into clusters. |
| `fixture` | The participant reacted to fake-runtime content. It never becomes an insight. |

Keep the participant's words in quotation marks and your own words outside
them. Cite the post-task answers (ease, hardest moment, expectations, words)
as notes too, with the step set to `post`.

Check reactions to placeholder content against the agentic-qa
[fake runtime list](../../agentic-qa/references/runtime.md#what-the-fake-runtime-shows-a-participant)
before calling them anything but `fixture`.

## Affinity mapping

When every session of a task is in:

1. Put all notes of that task in one list, without session order.
2. Group notes that describe the same difficulty or the same understanding,
   whatever the session. Name each group by what the participant experienced
   ("expected 'Templates' to start a blank document"), not by the screen
   ("Templates button").
3. Merge groups that share a cause in the participant's model of the product.
   Split a group whose notes need different fixes.
4. Count the sessions each group appears in. A group from one session stays
   in the readout as a single observation unless its severity is 3 or more.
5. Look for groups across tasks. A misread word that appears in two tasks is
   one insight.

Write the result to `synthesis.md` in the run directory: each group with its
name, the note IDs, and the session count.

## Insights

An insight is a group that explains behavior. Write it as:

```markdown
### I1. <what participants believe or do, and why>

Evidence: 4 of 5 sessions (P1-03, P2-07, P3-02, P5-11). Screenshots: P2/S004, P3/S002.
Quote: "I thought templates would be the start page." (P2, step 4)
Research question: RQ1
Severity: 3 (frequency 4 of 5, impact: delayed the task by 6 actions, persistence: repeated in T2)
Recommendation: <what should change for the user, not how to code it>
```

An insight says why, which a finding does not. "Participants clicked
Templates" is an observation. "Participants read 'Templates' as the place
where new work starts, because it is the largest control on the first screen"
is an insight. Mark the "because" as a hypothesis until the diaries or a
second study support it.

### Severity

Rate each insight on this scale, from the frequency, the impact, and whether
a participant who met it once met it again.

| Rating | Meaning |
|---|---|
| 0 | Not a usability problem. Keep as an observation. |
| 1 | Cosmetic. Noticed, but no effect on the task. |
| 2 | Minor. Slowed one or two sessions, recovered without help. |
| 3 | Major. Cost several actions, a wrong result, or a stop in more than one session. |
| 4 | Blocks. Participants could not complete the task, or completed it believing something false. |

A `lucky` success that leaves the participant with a false belief about the
product counts as impact, even though the task completed.

### Answering the research questions

For each research question write the answer, the insights it rests on, and
how sure the evidence makes you: `supported` (consistent across sessions),
`mixed` (sessions disagree), or `open` (too few sessions or a task that did
not reach the question).

## Follow-up

Every insight leaves the study with a status and a next step in
[insights.md](insights.md).

| Status | Next step | Who decides |
|---|---|---|
| `fix` | Change the UI. Name the PR when it exists. | The researcher, when the cause is verified and the change is small and follows [Design System](../../../../docs/DESIGN.md) and [Brand](../../../../docs/BRAND.md) |
| `decide` | Put the options to the user. Record their answer and date. | The user |
| `research` | Write the question for the next study. | The researcher |
| `accept` | Record why the team will not act. | The user |
| `shipped` | A fix is merged. Plan the validation study. | |
| `validated` | A validation study no longer shows the behavior. Cite the study. | |
| `not-validated` | The behavior is still there after the fix. Reopen as `fix`, `decide`, or `research`. | |

Do not mark an insight `fix` from a hypothesis. Confirm the cause first, by
diagnosis as in agentic-qa
[section 7](../../agentic-qa/SKILL.md#7-diagnose-only-after-the-blind-record-is-frozen),
or by a second study that tests it.

### Validation study

Run one after the fixes for a study's insights ship:

1. Copy the original plan's tasks, personas, and packet wording without
   changes. Use the same data state and viewport.
2. Run at least as many sessions per task as the original, with fresh
   participants on the fixed build.
3. Compare, per task: completions out of sessions, the actions to the end
   state, the ease ratings with their reasons, and whether the original
   insight's notes appear again.
4. Update each insight in [insights.md](insights.md) to `validated` or
   `not-validated`, with the validation study's name.

A change of route between studies (the participant now succeeds by another
path) is a result to report. A new difficulty on that path is a new insight.
