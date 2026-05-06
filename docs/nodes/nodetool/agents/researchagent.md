---
layout: page
title: "Research Agent"
node_type: "nodetool.agents.ResearchAgent"
namespace: "nodetool.agents"
---

# ResearchAgent removed

`nodetool.agents.ResearchAgent` has been replaced by the general-purpose [`nodetool.agents.Agent`](./agent.md) node.

For research workflows, use `Agent` with:

- `mode`: `plan`
- `prompt`: the research objective
- `tools`: `google_search` and `browser`
- dynamic outputs: define the structured result schema you need

The old `objective` input maps to `Agent.prompt`, and `system_prompt` maps to `Agent.system`.
