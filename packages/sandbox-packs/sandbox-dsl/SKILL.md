---
name: sandbox-dsl
description: Build a NodeTool workflow graph in the sandbox from generated node wrappers, one importable module per node namespace
---

# The workflow DSL in the sandbox

Specifier: `@nodetool-ai/sandbox-dsl`. The root exports `workflow()` and every
namespace under a short name. Each namespace is also its own module:
`@nodetool-ai/sandbox-dsl/nodetool.image`, `@nodetool-ai/sandbox-dsl/lib.audio`,
and so on for all 71.

Every node type is a generated function whose name and inputs come from the
node's own metadata. A type this pack does not export does not exist, and the
import fails before the program runs — which is the difference from building a
graph out of type strings.

## Build a graph

```js
import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { resize } from "@nodetool-ai/sandbox-dsl/nodetool.image";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const prompt = stringInput({ name: "prompt", value: "a fox in snow" });
const smaller = resize({ width: 256, height: 256 });
return workflow(output({ name: "image", value: smaller.output() }));
```

`workflow()` returns `{ nodes, edges }` in the kernel shape — nodes carry
`{id, type, properties}`, edges carry `{id, source, sourceHandle, target,
targetHandle}`. Hand that straight to `validate_workflow` or `create_workflow`.

## Check it, save it, run it

The graph is data until something checks it. Validate first — it costs nothing
and catches a missing property, a dangling edge, or a model nobody selected
before a run spends money on the half of the graph that does work:

```js
import { validate_workflow, create_workflow, run_workflow, debug_workflow }
  from "@nodetool-ai/sandbox-nodetool/workflows";

const graph = workflow(output({ name: "image", value: smaller.output() }));

const check = await validate_workflow({ graph });
if (!check.ok) throw new Error(check.issues.map((i) => i.message).join("; "));
```

`validate_workflow` answers `{ok, counts, issues}` — `ok` is false only when
the graph has errors, and each issue carries `{severity, code, message}`.
Warnings do not set `ok` false; read them off `issues`.

```js
const saved = await create_workflow({ name: "Thumbnailer", graph });
const run = await run_workflow({
  workflow_id: saved.id,
  params: { prompt: "a fox in snow" }
});
```

`run_workflow` answers `{status, outputs}`. When a run fails and the graph looks
right, `debug_workflow({workflow_id, params})` runs it again and answers one
report: `{workflow_id, run, job, workflow}`. `run` carries
`{status, outputs, error, verdict}` — `outputs` is keyed by output name and
each name holds an array of emitted values (`run.outputs.image[0]`). `job`
carries status, cost and logs; `verdict.headline` and `verdict.issues` say
which node failed and why.

Every model property must be selected before you save: assign a `find_model`
result's `ref` to the node's `model`. A graph saved with unselected models is
refused by `create_workflow`, because nothing stamps models in at run time.

Where the session mounts no capability modules, the same three verbs are
`nodetool.workflows.validate/create/run/debug`. Both forms reach one
implementation past one permission gate.

## Wiring

A node function returns a reference. `ref.output()` is the default output slot;
`ref.output("mask")` names one. Pass a handle as a property value and the edge
is wired for you:

```js
const wired = resize({ image: source.output(), width: 512 });
```

A node with several outputs has no default, so `output()` without a slot throws
and names the slots it has. A slot the node does not have throws the same way.

## Ids

Ids are assigned from the node type: `resize`, `resize_2`, `string_input`. They
are stable for a given program, so a later edit can name one — but the generated
wrappers take inputs and nothing else, so a program cannot choose an id.

## Everything in one import

```js
import * as dsl from "@nodetool-ai/sandbox-dsl";

const smaller = dsl.image.resize({ width: 256, height: 256 });
return dsl.workflow(dsl.output.output({ name: "image", value: smaller.output() }));
```

The `nodetool.*` namespaces drop the prefix (`dsl.image`, `dsl.input`,
`dsl.text`); the rest keep it in camel case (`dsl.libAudio`, `dsl.openaiImage`).
Importing one namespace module is cheaper than the root, which pulls all 71.

## Gotchas

- **`workflow()` lives only at the root.** A program that imports namespace
  subpaths still declares `@nodetool-ai/sandbox-dsl` for the builder.
- **A handle is not text.** `` `use ${node.output()}` `` throws rather than
  writing `[object Object]` into a property and wiring no edge.
- **Only reachable nodes ship.** `workflow(terminal)` walks back from its
  terminals; a node nothing wires to is dropped. Pass every terminal you want.
- **One graph per call.** `workflow()` clears the registry, so a handle from an
  earlier call is spent and using it throws.
- **This builds a graph; it does not run one.** The pack is pure computation —
  no models are called, no assets resolve, no node executes. Run the graph
  through the workflow tools once it validates.
