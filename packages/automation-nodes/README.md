# @nodetool-ai/automation-nodes

Browser, OS, filesystem, and automation nodes for [NodeTool](https://nodetool.ai).

Automate the local system from visual AI workflows: screenshot web pages, read
and write files, and schedule triggers.

## Install

```bash
npm install @nodetool-ai/automation-nodes
```

## Nodes

**Browser** (`lib.browser.*`) — `Screenshot`, which drives a real page over CDP.

**SQLite** (`lib.sqlite.*`) — `GetDatabasePath`.

**Triggers** (`nodetool.triggers.*`) — `Wait`, `ManualTrigger`,
`IntervalTrigger`, `WebhookTrigger`, `FileWatchTrigger`.

## What moved to the sandbox

Fetching and crawling pages, Excel, OCR, and the TensorFlow.js models are no
longer nodes. Each is a sandbox pack a `nodetool.code.Code` node imports —
`fetch` plus `@nodetool-ai/sandbox-html`, `-xlsx`, `-ocr` and `-tfjs` — which is
one script instead of a chain of near-identical nodes. See
[packages/sandbox-packs](../sandbox-packs/README.md).

The `lib.sqlite.*` CRUD nodes went too, without a pack behind them: a database
is a file the host holds open across calls, which the sandbox's plain-data
boundary does not model. A workflow that needs to keep something between runs
writes it with `workspace.*`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
