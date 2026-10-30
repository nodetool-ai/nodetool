# Full NodeTool CLI

Install this package explicitly alongside `@nodetool-ai/cli` for interactive
chat, MCP, media and game authoring, agents, deployment and repository harnesses.
The default CLI runs the installed command tree through `nodetool full`.
The pack manager admits the feature before loading its runner.

This package owns the full command implementations. The default CLI does not
import them or install them automatically.

```bash
nodetool packs add cli-full --yes
nodetool full --help
nodetool full mcp serve
nodetool full chat
```

A pack-managed feature does not add global binaries. To install the standalone
full binary on the global PATH instead:

```bash
npm install -g @nodetool-ai/cli-full
nodetool-full --help
```

See the [command reference](../../docs/cli.md) and
[default execution CLI](../cli/README.md).
