# First use and account protocols

This page is for the coordinator. Never give it to a participant. See
[README.md](README.md) for how to use a protocol.

## `website-discovery`

| Packet | Value |
|---|---|
| Kind | `discovery` |
| Entry | `https://nodetool.ai/` |
| Limits | 20 actions, 10 minutes |
| State | Public website, read-only |
| Goal | The `website-discovery` row in [journeys.md](../journeys.md#core-campaign) |

**Pass.** The participant's first impression and final account say what the
site offers and who it serves, each claim tied to a screenshot. It names a
next step it would take, or says why it would not try the product.

**Checks.**

- Quote the first impression from `participant-log.md` before any action, and
  compare it with the claims the later report makes.
- List every call to action the participant saw and which one it would have
  followed. Do not follow a sign-up or download.
- Record each blocked navigation outside the permitted origin. A blocked
  third-party link is a runner event, not a finding.

**Fakes.** None. This is the real public site.

**Known behavior.** Some cloud containers cannot reach `nodetool.ai`. Mark the
session `not run` with that reason. An unreachable site is not a UX finding.

## `app-first-use`

| Packet | Value |
|---|---|
| Kind | `discovery` |
| Entry | Disposable app root |
| Limits | 20 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Variant | Run one session at `"viewport": { "width": 1280, "height": 720 }` in a UX campaign |
| Goal | The `app-first-use` row in [journeys.md](../journeys.md#core-campaign) |

**Pass.** One thing the participant chose produced a visible result: a chat
reply, a run output, a generated image, or a saved document it opened again.

**Checks.**

- Read `S001`. Note whether the first viewport says that the app is loading.
- Note which getting-started checklist items ticked. The checklist on Home
  reads "Getting started · n/4" with "Connect an AI provider", "Start a
  guided flow", "Describe what you want to make", and "Open an example or a
  blank doc".
- Count the actions from the first screenshot to a connected provider.

**Routes.**

- Checklist "Connect an AI provider", paste the key, then type a request in
  the Home composer and pick "Test Chat Model". Rounds 2 to 5 took this route
  in 12 or 13 actions.
- "+ New" (aria "Open or create a tab"), then a "Guided flows" entry or a
  "Blank documents" entry.
- Home footer "Browse examples" or "Tutorials".

**Fakes.** The reply reads "deterministic e2e response". With `--state empty`
a request can run before a key is stored, while pickers still say no
provider is connected.

**Known behavior.**

- "Describe what you want to make" ticks only when a workflow run completes,
  not after a chat request. This is deliberate. Whether a chat request should
  count is an open product question.
- The skill pills on Home are video and ad tasks.
- The Vite dev server shows a frame with the top bar and no content for about
  a second after the loading spinner.

## `key-change`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | Two OpenAI test keys, labelled old and new |
| Goal | The `key-change` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** Settings shows one OpenAI key, the new one, and a request after the
switch returns a reply.

**Checks.** Look for two stored OpenAI keys side by side. Read every toast
and status label in Settings after the replacement.

**Routes.** The OpenAI provider card's "Replace key", paste the new key, then
the status "Verified". Settings opens from the logo menu or Ctrl+,.

**Fakes.** Any key passes the check, so the old key is never really revoked.
Judge only that the stored key changed.

## `learn`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "You want to learn how this app works before you make anything of
your own. Use only what the app itself offers to learn how to do one thing,
then do that thing by following what you learned."

**Pass.** The participant found in-app help, picked one lesson or guide, and
produced the result that guide describes.

**Checks.**

- Record where the participant first looked for help, and how many actions
  it took to find any.
- Compare the guide's steps with the screens the participant met. A step
  that names a button the screen does not show is a finding.
- Record whether the guide's "Check the result" matched what appeared.

**Routes.**

- More, then "Tutorials". Each tutorial has "What you'll learn" and "Try it
  yourself" (Start here, Your task, Check the result), with "Open task" or
  "Start building".
- Home footer "Tutorials".
- Logo menu "Help", with the tabs Shortcuts, Keyboard, and DataTypes. Ctrl+/
  opens it on the Keyboard tab.

**Fakes.** A tutorial that generates video, speech, or music cannot complete.
If the participant picks one, judge only the steps before the generation.

## `appearance`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Goal | The `appearance` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** The changed setting is still applied after a reload.

**Checks.** Crop every tooltip, menu, and toast in the new theme at full
size. Compare the tab names before and after the reload.

**Routes.** The sun or moon icon ("Switch to light mode", "Switch to dark
mode"), or Settings.

**Regression.** `web/tests/journeys/accessibility.spec.ts` checks tooltip
contrast in the light theme.

## `spend`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 30 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "You are worried about running up a bill with this app. Use it to
make one thing that uses AI, then find out how much you have spent so far."

**Pass.** The participant made something with a provider and then reached a
screen that states its spend, and its account repeats what that screen says.

**Checks.**

- Record whether the participant looked for spend before it created anything,
  and where.
- Compare the number the participant reports with the screenshot.
- Record any price shown before the run, for example "Voice all · ~$…".

**Routes.** More, then "Costs", or Ctrl+K. The page "Costs" shows "Total
spend", "Node executions", "Avg / execution", and "Top cost driver".

**Fakes.** Faked nodes and providers record no cost, so the page is expected
to show zero spend. Judge whether the participant found it and understood it,
not the amount. "No cost data for this period." on a zero result is a
comprehension finding only if the participant read it as an error.
