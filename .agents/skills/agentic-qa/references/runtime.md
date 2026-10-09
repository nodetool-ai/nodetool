# Runtime: environment and participant execution

This page is for the coordinator. Never give it to a participant.

## Why a subagent is not a participant

A subagent from the coordinator's own agent tool is contaminated in this
repository. It inherits the project instructions (`AGENTS.md`, `CLAUDE.md`),
user memory, the git status, the skill catalogue, and every MCP connector. A
conversation fork also inherits the coordinator's history. Browser MCP tools
such as Claude in Chrome return page text, element references, and the
accessibility tree (`read_page`, `find`, `get_page_text`), which fails the
visual-only contract below.

Run every participant through `web/tests/agentic-qa/runParticipant.ts`. It is
the only supported direct mode.

## Visual-only contract

A participant tool response may contain only:

- A viewport PNG at 1440 × 900 CSS pixels, device scale 1.
- A screenshot ID, the address bar URL, and the tab title.
- A neutral receipt: the action performed, the action count, and browser
  events that a person would see (a new tab, a dismissed dialog, a file picker,
  a blocked navigation outside the permitted origins).

It must never contain DOM, page text extraction, element locators, an
accessibility tree, console output, network data, storage, or full-page captures.

## The participant runner

The runner starts one Claude Agent SDK session and one fresh Chromium context.

| Boundary | How the runner enforces it |
|---|---|
| Instructions | `systemPrompt` is `references/participant.md` plus a tool guide. `settingSources: []`, so no `CLAUDE.md` or settings load. |
| Memory and repository | `cwd` is a new empty temporary directory. Auto memory is off. The session is not persisted. |
| Account | The CLI adds the logged-in account's email address to every session. With `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY` set, or in a Claude Code cloud session (`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1`, which authenticates through the host), the session uses an empty `CLAUDE_CONFIG_DIR`, which removes it. Otherwise `summary.json` records `accountContext: "account-email-visible"`. |
| Tools | Built-in tools are off (`tools: []` plus `disallowedTools`). The only MCP server is the in-process `browser` server. `strictMcpConfig` and `ENABLE_CLAUDEAI_MCP_SERVERS=false` drop user and account connectors. `skills: []` hides every skill. |
| Browser | Viewport screenshots only. Coordinate click, hover, drag, scroll, type, key press, bounded wait, Back, Forward, Reload, and file choice from packet assets. No URL navigation tool. The tool guide names the host platform, so the participant uses Control rather than Meta for editing shortcuts on Linux. |
| Origins | Top-level navigations outside `allowedOrigins` are aborted and reported as a visible event. |
| Limits | Actions past `maxActions` are refused. At `maxMinutes` every action is refused so the participant writes its account. The session is aborted three minutes later. |

The runner audits the SDK `init` message before the first action. The tool list
must equal the browser tool allowlist and the only MCP server must be `browser`.
Otherwise the session stops with `BLOCKED_ENVIRONMENT` and `validity: unverified`.
The init still lists discovered skills, plugins, and agent types. These are
unreachable because the `Skill` and `Agent` tools are absent. The runner keeps
them in `summary.json` as evidence.

### Context probe

Run the probe before a campaign and after an SDK upgrade:

```bash
cd web
npx tsx tests/agentic-qa/probeContext.ts
```

It starts a session with the participant options and asks it to quote all
context beyond its own prompt. It exits 1 when the answer shows an email
address, project instructions, the product name, a git repository, or a
callable tool. On a shared login it fails with `LEAK: email address`. Set a
token first. Report the probe result in the run contract.

`npm run test:agentic-qa` (from `web/`) checks the origin guard offline,
including a link that opens another origin in a new tab.

### Packet

```json
{
  "sessionId": "app-first-use",
  "kind": "discovery",
  "entryUrl": "http://127.0.0.1:3010/",
  "persona": "An adult who uses websites and web apps every day. You have not used this product before.",
  "goal": "You just opened this app for the first time. Find out what you can do with it, and try one thing that looks useful to you.",
  "maxActions": 20,
  "maxMinutes": 10,
  "allowedOrigins": ["http://127.0.0.1:3010"],
  "permittedActions": "This is a disposable test copy. You may create, edit, and run things inside it, and paste the test key listed below if the app asks for one. Do not enter real personal data, sign in to other sites, or pay.",
  "assets": [{ "name": "holiday-photo.jpg", "path": "/abs/path/holiday-photo.jpg" }],
  "credentials": [{ "label": "OpenAI API key (test)", "value": "sk-test-4f9a2c7e1b" }]
}
```

`kind` is `discovery`, `task`, or `continuation`. `assets` is optional. The
participant sees asset names only. `credentials` is optional: keys the persona
owns and may paste when the app asks. Use it with `--state empty`, where the
fake runtime accepts any key, so the participant goes through provider
onboarding the way a new user with an API key does. Never put a real
credential in a packet. Keep packet wording neutral: no product
terms, feature names, routes, or expected steps.

### Run

```bash
cd web
npx tsx tests/agentic-qa/runParticipant.ts \
  --packet test-results/agentic-qa/<run>/packets/<session>.json \
  --out test-results/agentic-qa/<run>/<session> \
  [--model sonnet] [--headed]
```

The runner authenticates through `CLAUDE_CODE_OAUTH_TOKEN` or
`ANTHROPIC_API_KEY` when set, and otherwise through the machine's Claude login.
It removes nested-session variables from the child environment. Where the
Playwright-pinned Chromium is not installed (a cloud container ships its own
build), set `PLAYWRIGHT_CHROMIUM_PATH`, for example
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. A failed launch is written
to `private/runner-error.txt`.

### Output

| File | Content | Share with participants |
|---|---|---|
| `contract.json` | Packet, rendered prompt, protocol SHA-256, tool allowlist, browser settings, SDK options without env | No |
| `screenshots/S###.png` | Every viewport the participant received | No |
| `steps.jsonl` | Every receipt, in order, with elapsed time | No |
| `participant-log.md` | The participant's own step notes, verbatim | No |
| `participant-report.md` | The participant's final account | No |
| `transcript.jsonl` | Full SDK stream with image data omitted | No |
| `summary.json` | Outcome, validity, action count, elapsed, browser time, overhead, agent cost, init audit | No |
| `private/browser.jsonl` | Console, page errors, failed requests, HTTP errors, blocked navigations, tool errors | No, and not before the blind record is frozen |

`overheadMs` is elapsed time minus browser action time. It is model and tool
overhead, not human think time.

## Disposable app

```bash
cd web
npx tsx tests/agentic-qa/serveApp.ts [--state empty|seeded-demo] \
  [--backend-port 7790] [--web-port 3010]
```

This starts the journey suite's backend
(`packages/websocket/src/screenshot-server.ts`) with
`NODETOOL_FAKE_PROVIDERS=1` and a Vite server proxied to it. The ports differ
from a developer's `npm run dev`, so the live app on :7777 and :3000 is never
touched. Set `NODETOOL_FAKE_PROVIDERS=0` only when the user approves provider spend.

Choose the data state per campaign and label it in the report:

| `--state` | Data | Providers | Use for |
|---|---|---|---|
| `empty` | Nothing: no workflows, threads, assets, or keys | Unconnected until the participant pastes a key from `credentials` | First-time-user sessions (`empty-new-account`) |
| `seeded-demo` (default) | Example workflows, threads, assets, and seven provider keys | Every provider connected | Returning-user or feature sessions |

Nothing seeds the browser in either state, so onboarding, the model picker,
and preferences are in their first-run state.

Reset between sessions with:

```bash
curl -X POST http://127.0.0.1:7790/api/test/reset
```

The backend is one in-memory database. Run app sessions in series and reset
between them. A public-website session can run beside an app session because
it shares no state.

### What the fake runtime shows a participant

The fakes in `packages/websocket/src/fake-runtime.ts` make every generation
goal completable, with placeholder content:

- OpenAI lists "Test Chat Model" and "Test Image Model". Anthropic lists "Test
  Assistant Model". No other provider lists a model.
- Chat replies read "deterministic e2e response". Workflow text outputs read
  "deterministic e2e output".
- A request that forces a tool (structured output: an image brief, a workflow
  plan, a Director screenplay) gets arguments that fit the schema, with the
  string "fake" in every text field.
- Generated images are a 256 × 256 colour gradient.
- Any key passes the onboarding key check without a network call.

Judge the outcome on mechanics (a result appeared, persisted, and can be found
again), not on content quality. A participant that reports "fake" text, the
fixed reply, or a missing GPT model list is describing the fixture. Record
these as fixture artifacts, not findings. The same holds for these known
fixture gaps:

- `worker.*` tRPC calls answer 500 because the test server has no worker
  manager, and `/api/config` answers 404. Neither is visible.
- Execution bypasses the provider check. With `--state empty`, a request runs
  through a fake even before a key is stored, while the pickers and the image
  step still say no provider is connected.

## Brokered fallback

Use brokered mode only when the runner cannot start, for example without a
Claude login. The coordinator executes one participant action at a time and
returns only the next viewport and a neutral receipt. The participant must still
start from an empty context with no project instructions, which a subagent
in this repository cannot satisfy. If no clean context is available, stop with
`BLOCKED_ENVIRONMENT`.
