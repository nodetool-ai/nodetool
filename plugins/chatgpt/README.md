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

Two separate tests. The first exercises this package. The second exercises only
the server.

### Install the package from the local marketplace

`.agents/plugins/marketplace.json` at the repository root lists the package
with the source path `./plugins/chatgpt/nodetool`.

1. In ChatGPT, open Settings, Security and login, and turn on Developer mode.
2. Add this repository as a local marketplace. In Codex the command is
   `codex plugin marketplace add .` from the repository root.
3. Install NodeTool from the Plugins Directory and complete the OAuth consent.
4. Start a new conversation and ask it to list workflows. Confirm the
   `nodetool` skill loaded, then confirm one run creates one job.

### Test the server alone

Add `https://api.nodetool.ai/mcp` under Plugins as a bare MCP URL and ask it to
list workflows. This checks OAuth and the tools. It does not load
`plugin.json`, the icons, or the skill.

Neither test has been run end to end. See the
[complete-plugin test procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Before publishing to the directory

Two blockers apply to the public directory only. Private and developer-mode use
is not affected.

1. The listing needs `privacyPolicyURL` and `termsOfServiceURL` in
   `extensions.com.openai.interface`, and screenshots under `assets/`. None
   exist in this repository.
2. The [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines#tool-independence-and-exposure)
   require each operation to be exposed individually with its own schema and
   annotations. They prohibit discovery plus a generic executor. The NodeTool
   MCP server exposes `execute_code` and a small direct set, and the skill tells
   the model to use `nodetool.searchTools`. This package stays private until
   the server exposes the supported operations individually.
