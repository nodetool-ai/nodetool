---
name: ux-research
description: Run a UX research study on NodeTool with blind agent participants who get small tasks, work out the UI from screenshots, and write down their experience, then synthesize the observations into tracked insights and follow-ups.
disable-model-invocation: true
---

# UX research: small tasks, blind participants

Learn how a newcomer understands NodeTool's interface: what they expect, which
words and controls they read correctly, and where their model of the product
differs from how it works. A study answers research questions. It does not
certify that a journey works, which is what [agentic-qa](../agentic-qa/SKILL.md)
does.

| | agentic-qa | ux-research |
|---|---|---|
| Question | Can a new user complete this journey, and what breaks? | How do new users understand this part of the UI, and why? |
| Task size | One outcome-led journey, up to 50 actions | One to three small tasks, about 15 actions each |
| Participant writes | A step log and a final account | A think-aloud diary, a post-task questionnaire after each task, and a closing account |
| Output | Findings `F1`, fixes, and regressions | Insights `I1`, severity, recommendations, and a validation study |

**You are the researcher, not the participant.** You may know NodeTool and read
its repository. The participant must receive neither your knowledge nor this
skill. The knowledge boundary, the environment, and the runner are the ones in
agentic-qa. Read its [section 3](../agentic-qa/SKILL.md#3-enforce-the-knowledge-boundary)
and [runtime.md](../agentic-qa/references/runtime.md) before the first session,
and follow them unchanged. Never use your own agent tool, a fork, or a browser
MCP for a participant.

This is an engineering skill. Do not load NodeTool's product skills into the
participant.

## 1. Plan the study

Read [insights.md](references/insights.md) first. It lists what earlier
studies learned and which insights wait for validation. Then write the study
plan in the run directory from [study-plan.md](references/study-plan.md):

- Two to four research questions in the user's words, for example "Do people
  recognise where to start something new?" A question that has a yes or no
  answer from one click belongs in agentic-qa.
- What the team will do differently depending on the answer. A question whose
  answer changes nothing is dropped.
- The tasks, from [tasks.md](references/tasks.md) or written new by its rules.
- The participants: how many sessions per task and which personas.
- The data state and the viewport for each session.

Use the user's research questions when they give them. Otherwise derive them
from open insights in [insights.md](references/insights.md), from known
behavior in the agentic-qa [protocols](../agentic-qa/references/protocols/README.md),
or from a surface that changed since the last study.

## 2. Recruit participants

A participant is one cold runner session. Run at least three sessions per task,
and five when a research question compares two designs or the results of the
first three disagree. Use different personas from
[study-plan.md](references/study-plan.md#personas) across sessions, so the
sample is not one reader repeated. Never resume a participant into a second
session, and never give one participant's diary to another.

## 3. Write and pilot the tasks

Write tasks as a scenario and an action in ordinary words, by the rules in
[tasks.md](references/tasks.md#writing-a-task). No product names, feature
names, menu labels, or routes. A task must have a visible end state the
researcher can check, and the participant must be able to tell when it is
done.

Pilot one session before the study. Read its diary for words the participant
copied from the task into the UI search, for a task it read differently from
the plan, and for an end state it could not recognise. Fix the wording and
record the change in the plan. A pilot is data only if the task did not change.

## 4. Run the sessions

Prepare the disposable app with `serveApp.ts` as
[runtime.md](../agentic-qa/references/runtime.md#disposable-app) describes, at
the state the task names. Reset the backend between sessions. Write one packet
per session. Put up to three tasks in its `goal`, numbered, in the order the
plan gives. Set `maxActions` to the sum of the task budgets.

Run the participant with this skill's protocol:

```bash
cd web
npx tsx tests/agentic-qa/runParticipant.ts \
  --packet ux-research-runs/<study>/packets/<session>.json \
  --out ux-research-runs/<study>/<session> \
  --protocol ../.agents/skills/ux-research/references/participant.md
```

`contract.json` records the protocol's path and SHA-256. A run whose protocol
is not this skill's [participant.md](references/participant.md) is not part
of the study.

Do not intervene while a session runs. If a participant is stuck past its
recovery limit, the session ends there. That end is data.

## 5. Take observation notes

Write notes while the record is fresh, one file per session, by the format in
[synthesis.md](references/synthesis.md#observation-notes). The participant's
diary says what it thought. Your notes say what you saw it do. Keep the two
apart and cite both.

Read every screenshot. Note each place where the participant hesitated,
backtracked, misread a label, looked in the wrong place first, or succeeded
without understanding why. Quote the diary verbatim. Run the
[ux-review.md](../agentic-qa/references/ux-review.md) checks too, and send any
defect they find to the report's defects list rather than mixing it into
insights.

After each session, write a debrief of three lines: what surprised you, what
confirmed an existing insight, and what to watch for in the next session.

## 6. Synthesize

When all sessions of a task are in, follow
[synthesis.md](references/synthesis.md): cluster the notes by affinity into
themes, write each theme that holds as an insight with its evidence count, rate
its severity, and answer each research question. Only then may you read source,
DOM, or logs to explain an insight, as in agentic-qa
[section 7](../agentic-qa/SKILL.md#7-diagnose-only-after-the-blind-record-is-frozen).

## 7. Recommend and read out

Write the readout from [report.md](references/report.md). Lead with the answers
to the research questions. Each insight gets a recommendation in terms of the
user's problem, not a patch. When more than one design could answer it, list
the options and say which one the evidence favours.

## 8. Follow up

The study is not done until each insight has a next step in
[insights.md](references/insights.md), recorded in the same change as the
readout. Triage each one as
[synthesis.md](references/synthesis.md#follow-up) describes:

- **Fix**: the cause and the change are clear and small. Make the change, with
  a test where the behavior is testable.
- **Decide**: the change needs a product or design call. Put the options to the
  user and record their answer.
- **Research**: the evidence is too thin or contradictory. Plan the question
  for the next study.
- **Accept**: the team decides not to act. Record why.

After a fix ships, run a validation study: the same tasks and the same packet
wording, with fresh participants on the fixed build. Compare the task results
and the diaries before and after. Mark the insight `validated` only when the
behavior that produced it no longer appears in the new sessions. A changed
route that creates a new difficulty is a new insight.

## Limits

An agent participant is not a person. It reads screenshots, not a screen, and it
has general knowledge of software that a real newcomer may lack. Treat a study
as a cheap first pass that finds problems and sharpens questions for research
with people.

Never report satisfaction scores, percentages of users, or human timings.
Report counts with their denominator ("3 of 5 sessions"). The ease rating in
the post-task questionnaire is an agent's self-report: list the ratings with
their reasons, report the median at most, and never compare it with human
benchmarks.
