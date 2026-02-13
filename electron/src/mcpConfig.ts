const NODETOOL_MCP_SERVER_NAME = "nodetool";
const NODETOOL_MCP_SSE_URL = "http://localhost:7777/mcp/sse";

export function getClaudeMcpConfigArg(): string {
  return JSON.stringify({
    mcpServers: {
      [NODETOOL_MCP_SERVER_NAME]: {
        type: "sse",
        url: NODETOOL_MCP_SSE_URL,
      },
    },
  });
}

export function getCodexMcpConfigArgs(): string[] {
  return [
    "-c",
    `mcp_servers.${NODETOOL_MCP_SERVER_NAME}.transport="sse"`,
    "-c",
    `mcp_servers.${NODETOOL_MCP_SERVER_NAME}.url="${NODETOOL_MCP_SSE_URL}"`,
  ];
}
