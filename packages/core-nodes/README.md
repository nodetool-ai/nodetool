# @nodetool-ai/core-nodes

Core logic, control-flow, and input nodes for [NodeTool](https://nodetool.ai).

The base building blocks for visual AI workflows: constants, control flow (if,
switch, loops), list operations, workflow inputs, variables, subgraphs, vector
store indexing and search, date/time, and validation. Pure-JS, no API keys.

## Install

```bash
npm install @nodetool-ai/core-nodes
```

## Nodes

**Control flow** (`nodetool.control.*`) — branching and iteration: `If`,
`Switch`, `ForEach`, `Collect`, `RepeatCount`, `RepeatValue`, `Take`,
`TakeWhile`, `DropWhile`, `Drop`, `TryCatch`, `Zip`, `Cross`, `Chunk`,
`Distinct`, `Count`, `Last`, `FilterEqual`, `FilterCode`, `Tap`, `Reroute`.

**Constants** (`nodetool.constant.*`) — typed literal values: `String`,
`Integer`, `Float`, `Bool`, `List`, `Dict`, `JSON`, `Image`, `Audio`, `Video`,
`Document`, `DataFrame`, `Date`, `DateTime`, and model constants
(`LanguageModelConstant`, `ImageModelConstant`, `TTSModelConstant`, and more).

**Inputs** (`nodetool.input.*`) — workflow entry points: `StringInput`,
`IntegerInput`, `FloatInput`, `BooleanInput`, `SelectInput`, `ImageInput`,
`AudioInput`, `VideoInput`, `DocumentInput`, `DataframeInput`, `MessageInput`,
model pickers (`LanguageModelInput`, `ImageModelInput`, `ASRModelInput`, …), and
list variants.

**Lists** (`nodetool.list.*`) — `Range`, `Tile`, `RepeatEach`, `RepeatValue`.

**Variables** (`nodetool.variable.*`) — `SetVariable`, `GetVariable`.

**Vector store** (`vector.*`) — index and query embeddings: `Collection`,
`IndexEmbedding`, `IndexTextChunk`, `IndexString`, `IndexImage`, `QueryText`,
`QueryImage`, `HybridSearch`, `GetDocuments`, `Count`, `Peek`, `RemoveOverlap`.

**Workflow** — `nodetool.workflows.subgraph.Subgraph`,
`nodetool.workflows.workflow_node.Workflow`.

**Date/time** (`lib.datetime.*`) — `Now`, `Format`, `Add`, `Diff`, `StartEnd`.

**Validation** (`lib.validate.*`) — `Email`, `URL`, `IP`, `String`, `Sanitize`.

**Compare** — `nodetool.compare.CompareImages`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
