import { Command } from "commander";
import { registerMcpClientCommands } from "./commands/mcp.js";

/** Register MCP client configuration and the actual stdio MCP server. */
export function createProgram(): Command {
  const program = new Command("nodetool");
  const mcp = program.command("mcp").description("Configure MCP clients or serve NodeTool tools over stdio");
  registerMcpClientCommands(mcp);
  mcp.command("serve").description("Run the NodeTool MCP server over stdio").action(async () => {
    const { refusePackInstallsInProcess } = await import("@nodetool-ai/pack-manager/packs/install-process");
    refusePackInstallsInProcess("mcp serve");
    const { createMcpServer, createMcpStdioTransport, forwardMcpStdioToLocalServer } = await import("@nodetool-ai/websocket");
    if (await forwardMcpStdioToLocalServer()) {
      process.stderr.write("NodeTool MCP forwarding to the local API server.\n");
      return;
    }
    const { setupCliDb } = await import("@nodetool-ai/cli-local/local-db");
    await setupCliDb();
    const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
    const { registerCliPacks, configureCliPackHost } = await import("@nodetool-ai/cli-execution/packs/host");
    const { CLI_LOCAL_BUILTIN_PACK_POLICY } = await import("@nodetool-ai/cli-execution/node-registry");
    configureCliPackHost(import.meta.resolve("@nodetool-ai/cli"));
    const registry = new NodeRegistry();
    await registerCliPacks(registry, CLI_LOCAL_BUILTIN_PACK_POLICY);
    const { createCatalogPackSource } = await import("@nodetool-ai/websocket/pack-source");
    await createCatalogPackSource().registerProviders(CLI_LOCAL_BUILTIN_PACK_POLICY);
    const { installSandboxCatalog } = await import("@nodetool-ai/cli-execution/sandbox-catalog");
    installSandboxCatalog();
    const server = createMcpServer({ registry, agentToolsScope: { userId: "1", source: "stdio-local" } });
    await server.connect(createMcpStdioTransport());
    process.stderr.write("NodeTool MCP server ready on stdio.\n");
  });
  return program;
}
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { initializeCliRuntime } = await import("@nodetool-ai/cli-common/runtime-env");
  initializeCliRuntime(import.meta.url);
  await createProgram().parseAsync([...argv], { from: "user" });
}
export const feature = { descriptor: { id: "cli-mcp", apiVersion: 1, requires: [], capabilities: ["cli:mcp"] }, run };
