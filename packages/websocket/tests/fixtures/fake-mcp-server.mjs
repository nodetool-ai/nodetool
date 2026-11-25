// A stdio MCP server for the external MCP tests. It echoes the credential it
// was started with, so a test can prove the answer is redacted.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "fake", version: "0.0.1" });
server.registerTool(
  "echo_env",
  { description: "Echo the credential", annotations: { readOnlyHint: true } },
  async () => ({
    content: [{ type: "text", text: `token=${process.env.FAKE_TOKEN ?? ""}` }]
  })
);
server.registerTool(
  "set_light",
  { description: "Switch a light" },
  async () => ({ content: [{ type: "text", text: "switched" }] })
);
await server.connect(new StdioServerTransport());
