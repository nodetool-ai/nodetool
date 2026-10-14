# Readout

This page is for the researcher. Never give it to a participant.

Write `report.md` in the study's run directory
(`web/ux-research-runs/<study>/report.md`). Refer only to files that exist.
When the user keeps reports elsewhere, copy the report and its evidence
screenshots there too.

## 1. Answers

Lead with the research questions. For each one: the answer in one or two
sentences, its confidence (`supported`, `mixed`, or `open`), and the insights
it rests on.

## 2. Insights

The insights from [synthesis.md](synthesis.md#insights), most severe first,
numbered `I1`, `I2`, and so on. Each has its evidence count, two or three note
IDs with screenshots, one diary quote, the severity, the recommendation, and
the follow-up status from [insights.md](insights.md). Where the evidence
supports more than one design, list the options and say which the evidence
favours.

Include what worked. A control that every participant understood is evidence
for keeping it.

## 3. Task results

| Task | Completed | Actions to end state | Ease ratings | Notes |
|---|---|---|---|---|
| T1 `start-new` | 3 of 5 | 4, 6, 12 | 6, 5, 3, 2, 2 | Two stopped in the template gallery (I1). |

`Completed` is judged from the end state in the plan, not from the
participant's claim. List every ease rating. Report a median at most, never a
mean or a percentage.

## 4. Sessions

| Session | Persona | Tasks | Validity | Runner outcome | Actions | Agent cost |
|---|---|---|---|---|---|---|

Take `validity`, the runner outcome, actions, and `agentCostUsd` from
`summary.json`. A session that is `CONTAMINATED` or `unverified` is listed and
excluded from the counts.

## 5. Defects

Defects seen during the study (`defect` notes), each with its screenshot. They
are not insights. Fix them as agentic-qa
[section 7](../../agentic-qa/SKILL.md#7-diagnose-only-after-the-blind-record-is-frozen)
describes, or list them for a QA round.

## 6. Follow-up

A table of every insight with its status and next step, matching
[insights.md](insights.md). Name the decisions the user has to make, with the
options for each.

## 7. Method and limits

The plan's build, data state, viewports, personas, model, task wording, and the
pilot's changes. State conspicuously: agent participants, fake providers,
seeded data, desktop viewports only, and the number of sessions. This is an
agent-based study, not research with people.
