import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  policy: { production: false },
  transport: {},
  connect: vi.fn(async () => {}),
  providers: vi.fn(async () => {}),
  register: vi.fn(async () => {}),
  sandbox: vi.fn(),
  createServer: vi.fn()
}));
vi.mock("@nodetool-ai/websocket", () => ({
  forwardMcpStdioToLocalServer: async () => false,
  createMcpServer: host.createServer,
  createMcpStdioTransport: () => host.transport
}));
vi.mock("@nodetool-ai/cli-local/local-db", () => ({ setupCliDb: async () => {} }));
vi.mock("@nodetool-ai/node-sdk", () => ({ NodeRegistry: class {} }));
vi.mock("@nodetool-ai/cli-execution/packs/host", () => ({ configureCliPackHost: () => {}, registerCliPacks: host.register }));
vi.mock("@nodetool-ai/cli-execution/node-registry", () => ({ CLI_LOCAL_BUILTIN_PACK_POLICY: host.policy }));
vi.mock("@nodetool-ai/websocket/pack-source", () => ({ createCatalogPackSource: () => ({ registerProviders: host.providers }) }));
vi.mock("@nodetool-ai/cli-execution/sandbox-catalog", () => ({ installSandboxCatalog: host.sandbox }));

beforeEach(() => { vi.clearAllMocks(); host.createServer.mockReturnValue({ connect: host.connect }); });

it("explicitly initializes the full MCP host providers before exposing tools", async () => {
  const { createProgram } = await import("../src/index.js");
  await createProgram().parseAsync(["mcp", "serve"], { from: "user" });
  expect(host.providers).toHaveBeenCalledExactlyOnceWith(host.policy);
  expect(host.providers.mock.invocationCallOrder[0]).toBeLessThan(host.createServer.mock.invocationCallOrder[0]);
  expect(host.sandbox).toHaveBeenCalledOnce();
  expect(host.connect).toHaveBeenCalledWith(host.transport);
});

it("does not expose tools when configured provider initialization fails", async () => {
  const failure = new Error("Configured provider failed");
  host.providers.mockRejectedValueOnce(failure);
  const { createProgram } = await import("../src/index.js");
  await expect(createProgram().parseAsync(["mcp", "serve"], { from: "user" })).rejects.toBe(failure);
  expect(host.connect).not.toHaveBeenCalled();
});
