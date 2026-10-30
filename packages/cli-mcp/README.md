# MCP commands

Client configuration and MCP serving. This feature also supplies the standalone
`nodetool-mcp` executable.

Install this independent command feature through the default CLI:

```bash
nodetool packs add cli-mcp --yes
nodetool mcp --help
```

Commands do not install missing features automatically. See the
[command reference](../../docs/cli.md#install-command-features).

For the standalone MCP executable:

```bash
npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install
```

See the [MCP setup guide](../../docs/mcp-server.md).
