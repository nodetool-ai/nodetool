# Chat prompt diet: a smaller, cache-stable chat prompt

This record covers the chat prompt redesign that Phase 1 of the
[fine-tuning v4 plan](plan.md#35-prompt-diet) depends on. The fine-tuned student
is a 9B model served by llama.cpp and Ollama. Its prompt measured 21.6k–26.5k tokens,
and those servers reuse the KV cache only for an identical token prefix. The redesign shrinks the prompt and fixes its
byte layout so each request reuses the previous request's cache.

Token counts use the Qwen3.5 tokenizer. The usage figures come from the epoch-6
eval traces, the GLM teacher validation traces and the v3e3 training bundle,
which are not checked in. The harness that runs the chat turn in the eval,
`packages/websocket/src/chat-jtbd.ts`, is in the open fine-tuning PR and is not
yet on `main`.

## Cache invariants

These are the primary requirement. Tests pin each one.

- I1. The system message and the provider tool list (names, order, schemas) are
  byte-identical for every turn of a thread and for every focus type: none,
  workflow, app, app_run, sketch, timeline, storyboard, script, svg, audio,
  model3d and jsscript. Nothing in them depends on the date, ids, counts,
  memory, focus, selection or open tabs. Before the change, two things broke
  this. Plan mode swapped `create_plan` and `execute_plan`, and app_run focus
  added direct tools in
  [`session/chat-turn.ts`](../../../packages/websocket/src/session/chat-turn.ts).
  The tool list must not change with the focus, so the app_run tools go. Plan
  mode keeps a constant set or is the one documented exception.
- I2. History is append-only. Each request's messages are a byte-identical
  prefix of the next request's messages, across tool rounds and across user
  turns, until compaction. Before the change, the turn-scoped block was appended
  to the last user message and not persisted (`volatileContext` in
  `chat-turn.ts`, `appendContextToLastUser` in
  [`session/chat-history.ts`](../../../packages/websocket/src/session/chat-history.ts)).
  On the next user turn the previous user message changed, so the server
  prefilled the whole previous turn again.
- I3. Per-turn content goes after everything a later request reuses. A per-turn
  block (focus header, focused tools, guide) is re-sent only when it changed
  since the last one the thread sent.
- I4. Compaction may break the prefix once. After it, I1–I3 hold again.

## Section budget

The "Before" column is the system message after an earlier, smaller diet pass,
measured on the epoch-6 traces. The budget set a target for each section. The
system message total excludes the tool schemas, which the provider request
carries separately.

| Section | Source | Before | Target |
|---|---|---|---|
| Tool JSON schemas (21 tools) | `DIRECT_TOOL_NAMES` in [`codeact/tool-api.ts`](../../../packages/agents/src/codeact/tool-api.ts) | 7,308 | 1,100 |
| Product knowledge | [`prompts/product-knowledge.ts`](../../../packages/agents/src/prompts/product-knowledge.ts) | 1,589 | 300 |
| Chat rules: effort, toolbelt, resources, linking, memory, permission | [`session/chat-prompt.ts`](../../../packages/websocket/src/session/chat-prompt.ts) | 3,788 | 1,300 |
| CodeAct rules and answering | [`codeact/prompt.ts`](../../../packages/agents/src/codeact/prompt.ts) | 1,441 | 650 |
| Tools, More tools and Direct tools lists | `codeact/prompt.ts` | 1,202 | 450 |
| Workflow graph model | [`codeact/graph-model.ts`](../../../packages/agents/src/codeact/graph-model.ts) | 436 | 0 (moves to the workflow turn block) |
| `nodetool` object model | [`codeact/nodetool-api.ts`](../../../packages/agents/src/codeact/nodetool-api.ts) | 2,902 | 900 |
| Document guidance | `codeact/nodetool-api.ts` | 332 | 150 |
| Sandbox API | `codeact/prompt.ts` | 1,233 | 250 |
| Skills catalog (17 skills) | [`skill-prompt.ts`](../../../packages/agents/src/skill-prompt.ts) | 800 | 450 |
| System message total | | 13,739 | 4,450 |
| Turn block: focus header and tools | `buildCodeActTurnSection` in `codeact/prompt.ts`, `chat-prompt.ts` | 0.5k–4.6k | 2,200 or less |
| Turn block: workflow and app guide | `chat-prompt.ts` | 3,349 | 150 on turns with no focus |

Before the change, the focused tool lists measured svg 282, audio 410, script
842, app 1,327, storyboard 1,518, sketch 1,612 and timeline 4,289 tokens.

The usage data justified most of the cuts. In 131 epoch-6 runs the student's
top-level calls were `execute_code` 1,755 times, `todo_write` 46, `view_image` 6
and node tools 14. GLM used the file tools 14 times in 262 runs. On timeline
tasks GLM used 15 distinct `ui_timeline_*` tools, and the top 10 made up 97% of
calls. Sketch had 17 distinct tools with the top 10 at 90%, storyboard 6, and
app 13 with the top 10 at 96%.

## Progressive disclosure of tools

The model sees tool detail only when it is about to use a tool. Disclosure has
three levels.

1. The turn block for a focused document lists that surface's tools by name,
   each with a one-line purpose. It carries no argument schemas.
2. `searchTools("select:<name>,…")` returns the full signature of each named
   tool: argument types, enums without truncation, nested required fields,
   `const` literals, array item shapes and optional field types.
3. The first time a tool's arguments fail validation within an action, the
   error returns that tool's signature. Later failures of the same tool in that
   action return only the error.

The signature at levels 2 and 3 replaces the truncated forms the tool list used
before: `firstSentence` descriptions, enums cut by `.slice(0, 6)`, and
`schemaTypeLabel` ignoring `const`, all in `codeact/tool-api.ts`. This absorbs
harness fixes H1–H3 of the plan. Selection in the plan's Phase 3 prefers teacher
runs that look up a signature before the first write, which targets failure
mode M2.

## Decisions

- C1. The provider tool schemas are `execute_code`, `todo_write` and
  `view_image`, plus the plan-mode tool where it applies. Every other tool stays
  reachable by import from inside an action.
- C2. Turns with no focus get a short pointer to the `nodetool-workflow-builder`
  skill instead of the workflow guide. A workflow-focus turn keeps a guide of
  about 1.2k tokens, and the graph model moves into that guide.
- C3. Duplicated chat rules go. "NodeTool resources" restated the object model
  and the folded families, and "Your toolbelt" restated "# Tools". The rule
  that each capability is an import, with no `tools.<name>()` call, appeared
  three times. It stays once, in the CodeAct prompt next to the import lines.
- C4. The object model gets one line per namespace in the system message. The
  focused type's full namespace entry goes in the turn block.
- C5. Product knowledge shrinks to about 300 tokens, and the rest moves into a
  skill.
- C6. The sandbox API lists names on one line instead of signatures.
- C7. The title, risk and description rules for CodeAct actions shrink from
  about 330 to 80 tokens. Three rules keep their meaning: nothing carries over
  between actions, log a result before extracting fields from it, and failed
  calls throw.
- C8. The deferred names list keeps the family lines and the names of the
  server tools that have no `nodetool.*` form, because `select:` lookups need
  exact names.
- C9. Focused tool lists follow the progressive disclosure above.

## Measured result

| Part | Before | After |
|---|---|---|
| System message | 13,739 | 4,501 |
| Provider tools | 7,308 | 1,605 |
| Per-turn block, focused surfaces | 0.5k–4.6k | about 280–980 |
| Per-turn block, workflow focus | 3,349 guide plus tools | 1,827 |

The whole prompt measured 21.6k–26.5k tokens before the change. The system
message and the provider tools are now constant across focus types, as
I1 requires, so a thread pays for them once. With the old prompt at 23.7k tokens
and about 650 added per reply, compaction arrived after about 52 replies. At
about 8k it arrives after about 76.

The plan's Phase 1 verification checks that the smaller prompt does not cost
task success. It runs GLM on the 131 validation tasks with two samples and the
base Qwen model on the old and the new prompt.
