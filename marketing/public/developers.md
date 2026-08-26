---
title: "NodeTool Developer Platform"
description: "One QuickJS sandbox runs every Code node body, saved script, and agent action — with the node catalog and the platform reachable by import."
canonical: https://nodetool.ai/developers
markdown: https://nodetool.ai/developers.md
product: NodeTool
---
# NodeTool Developer Platform

Every piece of JavaScript NodeTool did not write itself runs in one QuickJS WebAssembly isolate: a Code node body, a saved JS script, and every action an agent takes. Same engine, same limits, same imports.

Inside the guest, capabilities are globals the host granted for that run (`fetch` behind an SSRF guard, a contained `workspace`, scoped secrets, media and canvas bridges), and libraries are imports from 38 shipped packs. Two of those packs are NodeTool's own node catalog: `@nodetool-ai/sandbox-flow` calls 424 node types as async functions, and `@nodetool-ai/sandbox-dsl` builds a workflow graph you can validate, save, and open in the editor.

Agents drive NodeTool through the same surface. An agent step acts by writing a program, not by emitting a JSON tool call: the model sees one provider tool, `execute_code({code})`, and reaches 208 platform tools across 33 namespaces as imports from `@nodetool-ai/sandbox-nodetool/*`.

Read the [sandbox reference](https://docs.nodetool.ai/javascript-sandbox), the [CLI](https://docs.nodetool.ai/cli.md) for the validate/run/test loop, the [node catalog](https://docs.nodetool.ai/nodes/catalog.json) for node schemas, and the [developer guide](https://docs.nodetool.ai/developer/index.md) to write custom nodes.
