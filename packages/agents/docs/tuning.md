# Evaluation and Optimization

**Navigation**: [Agents package rules](../AGENTS.md) → **Evaluation and Optimization**

Paths are relative to `packages/agents/` unless they name another package.

### Cost Tracking

`CostCalculator` in `@nodetool-ai/runtime` tracks per-call costs based on provider pricing:

```typescript
provider.trackUsage(model, { inputTokens: 100, outputTokens: 50 });
console.log(provider.getTotalCost()); // USD
```

Costs are logged via `logProviderCall()` and included in `llm_call` messages.

### Model Selection

One run, one model. `create_plan` and `execute_plan` both use the calling
session's provider and model (`subAgentRuntime`), so planning and step
execution cannot drift apart or bill against a model the user did not pick.
The per-phase model idea survives only as a possible argument on those two
specs; nothing selects a second model.

### Tool Result Truncation and Chat Compaction

A single result is cut, and a whole thread is summarized. Two different limits,
in two different places.

- **One tool result** is capped at 25 000 characters (`MAX_TOOL_RESULT_CHARS`
  in `constants.ts`) before it enters history, with a notice telling the model
  the output was cut and how to ask for a smaller slice. A broad grep or a
  large file read otherwise returns tens of megabytes and the next request
  fails outright.
- **A step transcript is never summarized.** Step executors hand the
  tool-calling loop to `provider.generateLoop`, so each provider manages its
  own window — the Claude Agent SDK compacts internally, a stateless provider
  is sent everything. What bounds a step instead is the cumulative iteration
  cap and the result cut above.
- **A chat thread is compacted**, in `packages/websocket`
  (`session/chat-compaction.ts`, driven from `chat-turn.ts`). One
  summarizer call replaces everything before the last
  `NODETOOL_CHAT_COMPACTION_KEEP_TURNS` user turns, and the summary is
  persisted as a `role: "user"` row marked `execution_event_type:
  "compaction"`. History assembly starts from the newest such row, so only the
  provider's view is shortened — the full thread stays in the database for the
  UI and `nodetool.threads.*`. The cut lands on a user message, which is what
  keeps a tool call attached to its result.
- **Two triggers**: the prompt reaching the threshold before the loop, and the provider itself
  reporting that the prompt did not fit, which compacts and retries the turn
  once. A provider holding the transcript upstream skips the first, since
  shortening what NodeTool sends does not shorten what that provider already
  has.
- **The threshold is 90% of the model's input window** unless
  `NODETOOL_CHAT_COMPACTION_TOKENS` sets it. `resolveContextWindow` in
  `packages/runtime/src/providers/context-window.ts` asks the provider's
  Models API first (`BaseProvider.getContextWindow`), then models.dev by
  provider route and model, then falls back to 128 000 tokens with a warning.
  The chat turn caches the window per connection and `provider/model`. The
  prompt size is the larger of the local estimate and the provider-reported
  size of the thread's last call (`BaseProvider.lastCallTokens`).
- **A failed summarizer leaves the thread uncompacted** and the turn runs
  against the full history, with a `log_update` saying so. The alternative to
  an imperfect summary is a turn that cannot run at all.
- **The user sees the cut.** The web renders the compaction row as a collapsed
  "Earlier conversation summarized" card
  (`web/src/components/chat/message/CompactionCard.tsx`), reached from
  `MessageView` before the plain user-message path — without that branch the
  summary reads as something the user typed.

### Plan Validation

Plans are validated before execution:
- Step/task IDs must be unique across the entire plan
- Dependencies must reference valid IDs
- No circular dependencies (DAG validation via DFS)
- On failure, the error is fed back to the model as the tool result, and it
  calls `add_task` again

### Output Schema Validation

Steps can enforce structured output via JSON schema:
- `additionalProperties: false` enforced automatically
- Schema'd steps finalize ONLY through the finishing tool — `finish_step` in tool mode, `finish()` in a CodeAct action. There is no JSON-from-text extraction path, so a step that never calls it fails and emits an explicit error result.
- Unstructured steps (no schema) finalize when the model emits a no-tool-call assistant message; that text becomes the result.
- Two things make that contract visible to a model that believes `return graph` finished the step, because the observation for the losing move used to be indistinguishable from success. A CodeAct observation for a schema'd step that returned a value without finishing carries `finished: false` and a `note` — which says so explicitly when the returned value already matched the schema. And a schema'd step whose turn ended in prose is re-prompted with the contract, at most `MAX_FINISH_NUDGES` (2) times, before it fails.
- The failure message names the terminal state it actually hit: the provider's error, the run budget's own reason when a cost cap or deadline stopped the step, `exceeded N iterations` only when the loop really used its budget, else "ended after N action(s) / model turn(s) without calling finish", quoting the model's last message. A budget stop reported as "without calling finish" blamed the model for something it never got to do.
- `maxIterations` bounds the **step**, not each finish-nudge round. Each round is given what is left of the allowance and a round with nothing left is not run, so `MAX_FINISH_NUDGES` no longer multiplies the ceiling — a step configured for 4 model turns used to be able to make 12.

### Skills System

Skills come in two tiers.

A **user skill** is a row in the `skills` table — `name`, `description`, and
markdown `content` — that someone wrote and can rewrite.

A **system skill** ships with the build: a `SKILL.md` under
`packages/system-skills/<name>/`, frontmatter naming it, and it is **read-only
at runtime**. The tier exists because the two properties a user row cannot have
both matter: every install has the skill on day one with no seeding migration to
drift per machine, and nothing — including an agent acting on its own
mis-read instructions — can edit or delete the document it is working from.
`system-skills.ts` reads them (cached per process) from
`NODETOOL_SYSTEM_SKILLS_DIR` when it is set, else `_skills/` beside the bundled
`server.mjs` or the npm package's `dist/`, else `packages/system-skills` on the
way up from the module. The workspace build stages the npm copy through
[`NPM_RUNTIME_RESOURCE_DIRS`](../../config/src/package-asset-registry.ts). The
same resolution applies to the
sandbox packs, and for the same reason: nothing imports them, so they are not
workspaces and npm links nothing. `bundle-backend.mjs` stages them and
`verify-backend-bundle.mjs` fails a build that ships none.

The `*-prompting` skills carry a generation model line's prompting rules —
image (`nano-banana-pro-prompting`, `gpt-image-2-prompting`,
`flux-2-klein-prompting`, `seedream-prompting`, `qwen-image-prompting`), video
(`seedance-2-prompting`, `veo-3-prompting`, `minimax-h3-prompting`,
`wan-2-6-prompting`, `kling-video-prompting`, `hailuo-prompting`) and audio
(`elevenlabs-audio-prompting`, `stable-audio-prompting`).
`MODEL_PROMPTING_SKILLS` in
`model-prompting-skills.ts` maps a model id onto one, and `find_model` attaches
the answer as `prompting_skill` on every matching route. The guides are not
featured, so an agent that never called `find_model` finds one with
`list_skills({query})`, which matches the model ids each description lists.
`tests/model-prompting-skills.test.ts` checks the table against the skills on
disk, the ids the shipped provider manifests name, and the capability registry.

Both tiers share one catalog. `list_skills` and `load_skill` serve either, each
answer carrying `system: true|false`; `create_skill`, `update_skill` and
`delete_skill` refuse a shipped name, including a rename onto one. A user row
that *already* held the name predates the reservation, so it wins and the
shipped skill is not listed twice — reserving names stops new collisions, not
old ones. A malformed `SKILL.md` is skipped rather than fatal: one bad shipped
file must not cost a user every other skill.

Each record has `name`, `description`, and markdown `content` columns. Agent discovery reads
the current user's records through the models layer and merges trusted
sandbox-pack skills supplied for the session.

Nothing auto-selects a skill. Word overlap between an objective and a
description picked the wrong document often enough that the catalog plus
`load_skill` replaced it: the model reads what exists and asks for the one it
wants. Filesystem `SKILL.md` discovery and the `NODETOOL_AGENT_SKILL_DIRS`,
`NODETOOL_AGENT_SKILLS` and `NODETOOL_AGENT_AUTO_SKILLS` environment variables
are gone with it.

A chat turn discovers skills the way it discovers sandbox packs — a catalog in
context, a body behind a call. The websocket runner's `buildSystemContent` folds
`formatSkillCatalogForPrompt` (`src/skill-prompt.ts`) into every turn's system
prompt: one line per skill, name and description, plus the instruction to call
`load_skill` before acting on one. The block is ephemeral — it reaches the provider and is
never persisted, so it reflects the table as it is right now.

`/<name>` skips that round trip. A message naming a skill with a leading slash
is asking for it, so `findInvokedSkillNames` matches the text against the user's
own names and `formatInvokedSkillsForPrompt` puts those bodies in the same
block. The match needs a word boundary, so `src/utils` is a path and not an
invocation. The composer's `/` autocomplete
(`web/src/components/chat/composer/useTextareaSkillMention.tsx`) only types the
text; the expansion is server-side, so a headless client gets it too.

The `skills` capability module (`src/capabilities/skills.ts`) is the rest:

| Capability | Does |
|---|---|
| `list_skills` | Names and descriptions, optionally filtered by `query` |
| `load_skill` | One skill's full instructions by name |
| `create_skill` | Author a new skill (names are unique per user) |
| `update_skill` | Change name, description or body |
| `delete_skill` | Remove one |

Every one is scoped to `context.userId` and refuses a run that carries none.
Tests: `tests/capabilities-skills.test.ts`.

### Tuning Checklist

1. **Reduce cost**: run the session on a cheaper model, and give the run a
   `RunBudget` with a USD cap so a loop stops instead of billing
2. **Improve plan quality**: pass a `systemPrompt` preamble to `TaskPlanner` —
   it is prepended to the TaskArchitect contract, not swapped for it
3. **Speed up execution**: decompose into more independent tasks, since
   dependency edges are what serialize the DAG
4. **Control scope**: `maxStepIterations` bounds one step's action rounds; the
   run's `RunBudget` bounds everything else — nothing counts dispatch rounds
5. **Validate output**: use `outputSchema` to enforce structured step results
6. **Restrict tools**: per-step `tools` arrays limit which tools a step can call
7. **Observe**: enable tracing (`OTEL_TRACES_EXPORTER=console`) to see every
   LLM call
8. **Iterate on skills**: add domain-specific records in the Skills panel, and
   name one with `/<name>` to load its body without a round trip
