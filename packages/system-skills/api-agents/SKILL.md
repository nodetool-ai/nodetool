---
name: api-agents
description: "Call nodetool.agents from a code action: hand a self-contained task to a sub-agent, fan several out in parallel, or start background sub-agents and collect their results later. Load before the first call into nodetool.agents."
---

# nodetool.agents

A sub-agent is a fresh agent loop with the same tools as you and **none of
this conversation**. It answers with its final message as text.

| Call | Does | Answers |
| :--- | :--- | :--- |
| `run(prompt, {description})` | Runs a sub-agent and blocks until it finishes. | The final message of the sub-agent, as text |
| `start(prompt, {description})` | Starts a sub-agent and returns at once. | `{subtask_id, status: "running"}` |
| `wait({ids, timeoutMs})` | Blocks until the named sub-agents finish. Omit `ids` to wait for every one this turn started. `timeoutMs` is 1000–900000, default 300000. | Rows `{subtask_id, status, result \| error}`. `status` is `completed`, `failed`, `aborted`, or `running` after a timeout. |

`description` is the 3–7 word label the user sees. Without it the first six
words of the prompt are used.

## Write the prompt for a stranger

- Put everything the child needs in the prompt: the goal, the inputs (ids,
  uris, the text), the constraints, and what to return.
- Ask for the answer shape you want: "reply as JSON with fields title, url,
  summary". Parse the text you get back.
- Pass ids and `asset://` uris, not descriptions of them. The child can read
  them with its own tools.

## When to delegate

Delegate work that gains from a fresh, focused context: research one question
end to end, draft a self-contained section, review a result against a brief.
Do not delegate a single tool call. A sub-agent costs real time and money.

## Patterns

Parallel, blocking — one settled entry per prompt:

```js
const answers = await nodetool.batch(prompts, (p) => nodetool.agents.run(p),
  { concurrency: 4 });
```

Background — start, do other work, then collect in the same action:

```js
const a = await nodetool.agents.start(researchPrompt, { description: "Research competitors" });
const draft = await draftOutline();          // your own work meanwhile
const [row] = await nodetool.agents.wait({ ids: [a.subtask_id] });
```

Results of a sub-agent you never wait for are lost to the turn. Always wait
for what you need before the action ends.

Sub-agents can start sub-agents of their own, up to a depth limit. Results
they publish with `nodetool.shared.publish` are readable by the parent in the
same run (see `api-memory`).
