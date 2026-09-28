---
name: api-workflows
description: "Call nodetool.workflows, nodetool.jobs or nodetool.nodes from a code action: list, validate, save, run, debug and version workflow graphs, wait on background jobs, and look up or probe node types. Load before the first call into these namespaces."
---

# nodetool.workflows, nodetool.jobs, nodetool.nodes

These three namespaces cover saved graphs, the runs they start, and the node
catalog a graph is built from. How to design a graph is
`nodetool-workflow-builder`. This skill is the call reference.

Every method takes an id as the full id or its 12-character prefix, and every
method throws when its backing tool is not on this belt.

## nodetool.workflows

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({workflow_type, query, limit})` | Lists workflows. `workflow_type` is `"user"` (default), `"example"` or `"all"`. | `{workflows: [{id, name, description, tags}]}` — an envelope, not an array |
| `get(id)` | Reads one workflow with its graph. | The workflow record |
| `create(name, graph, {description, tags, access, project_id})` | Saves a new workflow. `graph` is a DSL result, `{nodes, edges}`, or a workflow record. `create({name, graph})` also works. | The saved workflow with its `id` |
| `validate(idOrGraph)` | Checks a graph against the node registry without a run. | `{ok, issues}`. Throws when the graph has errors, so a broken graph cannot reach a paid run. |
| `run(id, params, {interactive})` | Runs and blocks until the run settles. | The run result. With `interactive: true`, a failed node returns `status: "escalated"`. |
| `start(id, params)` | Starts a run and returns at once. | A receipt `{job_id, id, status: "running"}` |
| `debug(id, params, {interactive, include_graph, log_limit})` | Runs and reports. | `{workflow_id, run, job, workflow}` |
| `resolve(sessionId, escalationId, action, {outputs, reason, apply_to})` | Answers an escalation. | The next escalation, or the final report |
| `example("<package>/<name>")` | Loads a shipped example with its graph. A bare name reads from `nodetool-base`. | The example workflow |
| `versions(id, {limit})`, `getVersion(id, n)` | Lists and reads snapshots. | Version rows, newest first |
| `snapshot(id, {name, description})` | Saves the current graph as a manual version. | The new version number |
| `restore(id, n)` | Rolls the graph back. The graph it replaces is snapshotted first, so a restore can be undone. | — |
| `deleteVersion(id, n)` | Deletes one snapshot. This cannot be undone. | — |
| `open(id?)` | Opens the editable object model of a graph that is open in the editor. Throws when no editor tools are on the belt. | A workflow object: `addNode`, `connect`, `commit()` |

### The debug report

`debug` answers `{workflow_id, run, job, workflow}`:

- `run.status` is the verdict of the run, and `run.error` names the failure.
- `run.outputs` is keyed by output name. Each name holds an **array** of the
  values it emitted, so read `run.outputs.summary[0]`, not `run.outputs.summary`.
- `run.verdict.issues` lists what went wrong, node by node.
- `job` carries the status, the cost and the logs.

### Escalations

An interactive run parks on a failed node and answers `status: "escalated"`
with a `session_id`, an `escalation_id` and the `allowedActions`. The actions
are `retry`, `substitute` (with `{outputs}`, only when the escalation has a
`candidateOutput`), `skip`, `end_stream` and `fail` (with `{reason}`).
`apply_to: "signature"` also answers later failures with the same signature.
Write the whole loop in one action:

```js
let report = await nodetool.workflows.debug(id, params, { interactive: true });
while (report.status === "escalated") {
  const e = report;
  report = await nodetool.workflows.resolve(e.session_id, e.escalation_id, "skip");
}
return { status: report.run?.status, issues: report.run?.verdict?.issues };
```

### Rules

- A saved graph is not a run. When the user asked for results, call `run`.
- Validate before `create` and before a paid run. `validate` throws on errors,
  and its message lists the errors only.
- A `*_model` property left unset fails validation. Assign
  `(await nodetool.models.pick(capability)).ref`.
- `create` checks model properties. An unknown provider or model id is refused
  and not saved.

## nodetool.jobs

A job is one execution of a workflow, and a render of a timeline is a job too.

| Call | Answers |
| :--- | :--- |
| `list({workflow_id, limit})` | Job rows with status, timing, error and the names of the outputs. The values are not in the list. |
| `get(idOrReceipt)` | One job, with the outputs once it has settled |
| `logs(idOrReceipt, {limit})` | The log tail. It answers for a failed job too, with the failure under `job_error`. |
| `wait(idOrReceipt, {timeoutMs, pollMs})` | Polls until the status is `completed`, `failed`, `cancelled` or `error`, then answers the job. The default timeout is 600000 ms. On a timeout it throws with the last status. |

Every call takes the id string or the receipt that `start()` answered.
Start, do other work, then wait, all in one action:

```js
const receipt = await nodetool.workflows.start(id, { prompt: "a fox" });
// … other work in the same action …
const settled = await nodetool.jobs.wait(receipt, { timeoutMs: 300000 });
return { status: settled.status, outputs: settled.outputs };
```

Do not write one `get()` per action. `wait` is the polling loop.

## nodetool.nodes

| Call | Does | Answers |
| :--- | :--- | :--- |
| `search(query, {n_results, namespace, input_type, output_type, include_provider_nodes})` | Searches the catalog. `query` is a string or an array of terms. | `{total, results}`. The node type of a result is on `type`, not `node_type`. |
| `info(type)` | Reads one node type: properties, inputs, outputs, defaults. | The node metadata |
| `list({namespace, limit})` | Browses a namespace. An unknown namespace answers with the namespaces that exist. | Node rows |
| `run(type, inputs)` | Runs ONE node with a property bag, with no workflow. | The outputs, keyed by slot |

- Never guess a node type. Search, then read `info` for the exact property
  names before you wire the node.
- Provider nodes (`openai.*`, `fal.*` and others) are hidden unless you pass
  `include_provider_nodes: true`. Pass it only when the user named a provider.
- `run` is the cheapest probe of what a node does. Try one node before you
  put it in a graph.
- To call nodes as functions inside an action, import them from
  `@nodetool-ai/sandbox-flow`. To author a graph, import them from
  `@nodetool-ai/sandbox-dsl`. `nodetool-js-scripting` covers both packs.
