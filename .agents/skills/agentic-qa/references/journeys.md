# Journey catalogue

This page is for the coordinator. Never give it to a participant, and never
copy its "what the coordinator checks" lines into a packet.

Each session is independently cold: a new runner process, a fresh browser
context, and a reset backend for app sessions. A continuation reuses the
browser state of its parent session only when the runner supports it. Until
then, run persistence as the last part of the task session itself.

Use the persona from the packet example in [runtime.md](runtime.md) unless the
user names one. Do not name NodeTool features in a goal.

## Core campaign

| Session | Kind | Entry | Limits | Goal given to the participant |
|---|---|---|---|---|
| `website-discovery` | discovery | `https://nodetool.ai/` | 20 actions, 10 min | Find out what this website offers, who it is for, and whether you would want to try it. |
| `app-first-use` | discovery | disposable app root | 20 actions, 10 min | You just opened this app for the first time. Find out what you can do with it, and try one thing that looks useful to you. |
| `task-outcome` | task | disposable app root | 50 actions, 10 min | One goal from the outcome list below. |

The website session is read-only: no sign-up, log-in, purchase, download, or
message. Do not turn a website call to action into a local-app URL. The app
sessions start at the disposable app root.

## Outcome goals

Choose one per campaign. Rotate between campaigns.

| ID | Goal given to the participant | What the coordinator checks |
|---|---|---|
| `image` | Create a picture from a short written description of your choice. Then make sure you can find that picture again later, after you leave the page and come back. | A visible generated image. After reload or return, the image is reachable through visible navigation. |
| `chat` | Ask the app's assistant a question and get an answer. Then find that conversation again after you leave the page and come back. | A visible reply. The thread is reachable after reload. |
| `automation` | Set up something that takes a sentence you type and gives back a changed version of it, then try it with your own sentence. | A run with the participant's input and a visible output. |
| `app` | Find a small ready-made tool in this app, use it with your own input, and see its result. | A visible result for the participant's own input. |

With fake providers every goal can complete, with placeholder content (see
[runtime.md](runtime.md#what-the-fake-runtime-shows-a-participant)). Judge
`automation` on whether the participant's sentence reached a run and a visible
output appeared. Only the guided planner's plan changes the sentence (it
capitalizes it). A model step answers with the fixed reply whatever the input.

## Persistence and recovery

Include these inside the task session when the goal allows:

- Persistence: the participant leaves the result (Back, a different page, or a
  reload through visible means) and finds it again.
- Recovery: if the participant makes a mistake, record whether visible
  affordances (undo, close, back, delete) let it recover.

## Omissions to report

Always list sessions that did not run and why: no approved app, no Claude login,
`BLOCKED_ENVIRONMENT`, or a skipped goal. Sign-up, payment, account linking,
mobile layouts, and real-provider quality are outside the core campaign. Report
them as not covered.
