# Journey protocols

This directory is for the coordinator. Never give it to a participant, and
never copy a protocol's routes, checks, or known behavior into a packet.

A protocol turns one user journey into a repeatable run: the packet to send,
the outcome that counts as success, the checks to run on the screenshots, the
routes a participant can take, what the fake runtime cannot do on that path,
and the behavior that earlier rounds already settled. The goal text a
participant receives is in [journeys.md](../journeys.md) for the goals listed
there, and in the protocol for the goals that are not.

## Using a protocol

1. Pick the journeys for the campaign from the index below. Every campaign
   runs `app-first-use` and at least one other P1 journey. Prefer journeys
   that no earlier round in the user's reports ran.
2. Write the packet from the protocol's **Packet** table and the goal text.
   Use the persona from the packet example in [runtime.md](../runtime.md#packet).
   Add the assets and credentials the protocol names, and nothing else.
3. Start `serveApp.ts` with the protocol's state, reset the backend, and run
   the participant as [runtime.md](../runtime.md#run) describes.
4. After the run, judge the outcome against **Pass**, not against the
   participant's claim. Run the [ux-review.md](../ux-review.md) checks and the
   protocol's **Checks**.
5. Read **Routes** to say which path the participant took, and where it left
   the path. Read **Fakes** before calling anything a defect. Read **Known
   behavior** before writing a finding, and report a match as "seen again"
   with its evidence, not as a new finding.
6. When a round fixes a defect or settles a product question, update the
   protocol's **Known behavior** in the same PR.

**Routes** are diagnostic. A participant that reaches the outcome another way
has passed. A route that no participant finds is a discoverability finding,
not a reason to hint at it.

## Priorities

- **P1**: the journeys that decide whether a new user gets any value. A
  regression here blocks first use.
- **P2**: the main document kinds and the ways people keep, find, and change
  their work.
- **P3**: secondary surfaces, or journeys the fake runtime can only partly
  complete.

## Index

| ID | Journey | Priority | State | Protocol |
|---|---|---|---|---|
| `website-discovery` | Understand the public website | P1 | public site | [first-use.md](first-use.md#website-discovery) |
| `app-first-use` | Open the app and do one useful thing | P1 | empty | [first-use.md](first-use.md#app-first-use) |
| `key-change` | Replace a revoked provider key | P2 | empty | [first-use.md](first-use.md#key-change) |
| `learn` | Learn the app from its own help | P2 | empty | [first-use.md](first-use.md#learn) |
| `appearance` | Make the app easier to read | P3 | empty | [first-use.md](first-use.md#appearance) |
| `spend` | Find out what has been spent | P3 | empty | [first-use.md](first-use.md#spend) |
| `chat` | Ask the assistant and find the answer again | P1 | empty | [chat.md](chat.md#chat) |
| `ask-file` | Ask the assistant about a file | P2 | empty | [chat.md](chat.md#ask-file) |
| `automation` | Build something that changes a sentence | P1 | empty | [workflows.md](workflows.md#automation) |
| `automation-keep` | Run it again after leaving | P1 | empty | [workflows.md](workflows.md#automation-keep) |
| `app` | Use a ready-made tool | P1 | empty | [workflows.md](workflows.md#app) |
| `past-result` | Find an earlier result without rerunning | P2 | empty | [workflows.md](workflows.md#past-result) |
| `run-failure` | Recover from a run that fails | P2 | needs a fixture | [workflows.md](workflows.md#run-failure) |
| `image` | Create a picture and find it again | P1 | empty | [library.md](library.md#image) |
| `photo` | Change a photo of your own | P2 | empty | [library.md](library.md#photo) |
| `name-find` | Name something and find it by name | P1 | empty | [library.md](library.md#name-find) |
| `organize` | Group two things under a name | P2 | empty | [library.md](library.md#organize) |
| `undo-delete` | Delete something and try to get it back | P2 | empty | [library.md](library.md#undo-delete) |
| `copy-edit` | Copy something and change only the copy | P2 | empty | [library.md](library.md#copy-edit) |
| `projects` | Keep a new piece of work separate | P2 | empty | [library.md](library.md#projects) |
| `build-app` | Make a small tool of your own | P2 | empty | [creative.md](creative.md#build-app) |
| `sketch` | Draw something and open it again | P2 | empty | [creative.md](creative.md#sketch) |
| `storyboard` | Plan a video scene by scene | P2 | empty | [creative.md](creative.md#storyboard) |
| `timeline` | Put two photos into a short video | P2 | empty | [creative.md](creative.md#timeline) |
| `game` | Make a small game and play it | P3 | empty | [creative.md](creative.md#game) |
| `voice-script` | Have a script read aloud | P3 | real providers only | [creative.md](creative.md#voice-script) |

## Not covered

These journeys have no protocol. Report them as not covered when a campaign
claims full coverage.

- Sign-up, sign-in, payment, and plan changes. They need real accounts and
  spend, which the skill forbids.
- Sharing or publishing a workflow or an app. Publishing is forbidden, and the
  runner cannot open a link a participant receives.
- Installing local models, packages, or Python nodes. They download from the
  network and change the machine.
- 3D models, SVG documents, JS scripts, skills, entities, collections, and
  memory. These are expert surfaces, and a first-time goal for them would
  have to name the feature.
- Mobile layouts. A small `viewport` packet tests a narrow window, not touch
  input or the mobile app.
