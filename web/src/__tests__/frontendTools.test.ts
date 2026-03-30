import { FrontendToolRegistry } from "../lib/tools/frontendTools";
import { z } from "zod";

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

  it("omits hidden tools from the manifest", () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_hidden",
      description: "Hidden tool",
      hidden: true,
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { ok: true } as any;
      }
    });

    const manifest = FrontendToolRegistry.getManifest();
    expect(manifest.some((t) => t.name === "ui_hidden")).toBe(false);
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

  it("coerces boolean and number string args for zod-backed tools", async () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_coerce",
      description: "Coerce args",
      parameters: z.object({
        include_outputs: z.boolean(),
        limit: z.number().int().min(1),
      }),
      async execute(args: { include_outputs: boolean; limit: number }) {
        return {
          include_outputs: args.include_outputs,
          limit: args.limit,
          include_outputs_type: typeof args.include_outputs,
          limit_type: typeof args.limit,
        } as const;
      },
    });

    const result = await FrontendToolRegistry.call(
      "ui_coerce",
      { include_outputs: "true", limit: "25" },
      "call_2",
      { getState: () => ({} as any) },
    );

    expect(result).toEqual({
      include_outputs: true,
      limit: 25,
      include_outputs_type: "boolean",
      limit_type: "number",
    });
    unregister();
  });

  it("does not coerce invalid boolean-like strings", async () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_coerce_invalid",
      description: "Coerce invalid args",
      parameters: z.object({
        include_outputs: z.boolean(),
      }),
      async execute(args: { include_outputs: boolean }) {
        return { include_outputs: args.include_outputs } as const;
      },
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_coerce_invalid",
        { include_outputs: "yes" },
        "call_3",
        { getState: () => ({} as any) },
      ),
    ).rejects.toThrow();

    unregister();
  });
});
