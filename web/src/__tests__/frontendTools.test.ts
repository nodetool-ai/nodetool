import { FrontendToolRegistry } from "../lib/tools/frontendTools";

describe("FrontendToolRegistry", () => {
  afterEach(() => {
    // No direct clear API; register returns an unregister fn
  });

  it("registers tools and returns manifest entries", () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_test",
      description: "Test tool",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { ok: true } as any;
      }
    });

    const manifest = FrontendToolRegistry.getManifest();
    expect(manifest.some((t) => t.name === "ui_test")).toBe(true);
    unregister();
  });

  it("executes a registered tool and returns its result", async () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_echo",
      description: "Echo tool",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"]
      },
      async execute(args: { value: string }) {
        return { echoed: args.value } as any;
      }
    });

    const result = await FrontendToolRegistry.call(
      "ui_echo",
      { value: "hello" },
      "call_1",
      { getState: () => ({} as any) }
    );
    expect((result as any).echoed).toBe("hello");
    unregister();
  });
});
