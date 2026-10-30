# MCP commands

Register NodeTool with detected MCP clients in one command:

```bash
npx -y @nodetool-ai/cli-mcp install
```

This independent command feature supplies the standalone `nodetool-mcp`
executable. To use it through the default CLI instead:

```bash
nodetool packs add cli-mcp --yes
nodetool mcp --help
```

Commands do not install missing features automatically. See the
[command reference](../../docs/cli.md#install-command-features) and
[MCP setup guide](../../docs/mcp-server.md).

Verify npm executable selection after building, from the repository root:

```bash
node scripts/mcp-npx-packed-smoke.mjs
```

The smoke test uses an isolated consumer, npm cache, and temporary client home.
A local registry serves the packed workspace artifacts.
