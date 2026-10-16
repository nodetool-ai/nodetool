# Study plan

This page is for the researcher. Never give it to a participant.

Write `plan.md` in the study's run directory
(`web/ux-research-runs/<study>/plan.md`) before the pilot. Change it only by
adding a dated note that says what changed and why. A plan rewritten after the
results is not a plan.

## Template

```markdown
# Study: <short name>

Build: <git commit>
Researcher: <who ran it>

## Research questions

RQ1. <question in the user's words>
     Decision it informs: <what the team does differently depending on the answer>
RQ2. ...

## Tasks

| Task | Text given to the participant | Answers | State | Budget |
|---|---|---|---|---|
| T1 `<task id>` | <scenario and action> | RQ1 | empty | 15 actions |

End state for each task (researcher only):
- T1: <what the screenshot must show>

## Participants

| Session | Persona | Tasks, in order | Viewport |
|---|---|---|---|
| P1 | newcomer | T1, T2 | 1440 × 900 |

## Pilot

Session, date, and the wording changes it caused.

## Notes

Dated changes to this plan.
```

## Research questions

A good research question names a user, a part of the UI, and something the
team is unsure about. "Do people who arrive with an API key know where to put
it?" is one. "Is onboarding good?" is too broad to answer, and "Does the Save
button work?" is a QA check.

Each question needs a decision it informs. If every possible answer leads to
the same action, drop the question.

## Personas

Rotate these across sessions. Each is one sentence for the packet's `persona`
field. None names the product or its features.

| ID | Persona text |
|---|---|
| `newcomer` | An adult who uses websites and web apps every day. You have not used this product before. |
| `creator` | You make images and short videos for social media with phone apps. You have not used this product before. |
| `office` | You use email, spreadsheets, and shared documents at work every day. You have not used this product before. |
| `developer` | You write software for a living and have used AI chat assistants. You have not used this product before. |
| `cautious` | You use a few websites regularly and prefer to read before you click. You have not used this product before. |
| `retired` | You are retired and use a laptop for email, photos, and video calls with family. You have not used this product before. |
| `small-business` | You run a small shop and do its marketing and paperwork yourself on a laptop. You have not used this product before. |

A persona changes how the participant reads the screen, not what it knows
about NodeTool. Never put product knowledge in a persona.

## Sample size

Three sessions per task find the problems most participants hit. Five sessions
show whether a problem is common or one participant's path. Use five when the
first three disagree, when a question compares two designs, or for a
validation study.

## Packet

Write packets as
[runtime.md](../../agentic-qa/references/runtime.md#packet) describes. Number
the tasks in `goal`:

```json
{
  "sessionId": "p1-start-and-key",
  "kind": "task",
  "entryUrl": "http://127.0.0.1:3010/",
  "persona": "You make images and short videos for social media with phone apps. You have not used this product before.",
  "goal": "Task 1: You want to make something new here. Find where you would start, and start it. Task 2: The app needs your OpenAI key before it can answer you. Add it.",
  "maxActions": 30,
  "maxMinutes": 10,
  "allowedOrigins": ["http://127.0.0.1:3010"],
  "permittedActions": "This is a disposable test copy. You may create, edit, and run things inside it, and paste the test key listed below if the app asks for one. Do not enter real personal data, sign in to other sites, or pay.",
  "credentials": [{ "label": "OpenAI API key (test)", "value": "sk-test-4f9a2c7e1b" }]
}
```

Keep the task wording identical across all sessions of a study, and across a
study and its validation study.
