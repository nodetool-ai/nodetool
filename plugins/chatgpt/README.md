# NodeTool plugin for ChatGPT and Codex

`nodetool/` is a plugin package in the portable Agent Plugins layout that
[OpenAI plugins](https://developers.openai.com/plugins/build/plugins) read:

| File | Purpose |
|---|---|
| `plugin.json` | Manifest and the `extensions.com.openai` listing metadata |
| `mcp.json` | Bundled MCP server, `https://api.nodetool.ai/mcp` |
| `skills/nodetool/SKILL.md` | Instructions for using the NodeTool tools |
| `assets/` | Composer icon and logo |

The plugin carries no code. It points ChatGPT at the NodeTool MCP endpoint,
which authenticates with OAuth and binds the signed-in user. See
[MCP on a production server](../../docs/mcp-production.md).

## Self-hosted server

Change the URL in `nodetool/mcp.json` to `https://your-server/mcp`. The server
needs `NODETOOL_ENABLE_MCP=1` and an HTTPS `NODETOOL_PUBLIC_URL` so clients can
run the OAuth flow.

## Test locally

1. In ChatGPT, open Settings, Security and login, and turn on Developer mode.
2. Add the plugin from this directory, or add the MCP URL under Plugins.
3. Open a Work chat, type `@`, pick NodeTool, and ask it to list workflows.

## Before publishing to the directory

The listing needs `privacyPolicyURL` and `termsOfServiceURL` in
`extensions.com.openai.interface`, and screenshots under `assets/`. They are
not set because no policy URLs or screenshots exist in this repository. Check
the [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).
