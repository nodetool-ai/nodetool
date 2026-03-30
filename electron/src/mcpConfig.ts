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

export function getCodexMcpConfigArgs(pythonPath: string): string[] {
  return [
    "-c",
    `mcp_servers.${NODETOOL_MCP_SERVER_NAME}.command="${pythonPath}"`,
    "-c",
    `mcp_servers.${NODETOOL_MCP_SERVER_NAME}.args=["-m","nodetool.api.run_mcp_server"]`,
  ];
}
