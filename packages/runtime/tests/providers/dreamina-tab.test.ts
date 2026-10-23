import { afterEach, describe, expect, it, vi } from "vitest";
import { DreaminaProvider, setDreaminaPendingStore } from "../../src/providers/dreamina-provider.js";
import { memoryPendingStore } from "../../src/providers/dreamina-pending.js";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@nodetool-ai/browser", () => ({ createExtensionPage: mocks.open }));

afterEach(() => {
  setDreaminaPendingStore(null);
  vi.clearAllMocks();
});

describe("Dreamina tab", () => {
  it("unfreezes a background tab before each script", async () => {
    setDreaminaPendingStore(memoryPendingStore());
    const steps: string[] = [];
    mocks.open.mockResolvedValue({
      page: {
        evaluate: vi.fn(async (expression: string) => {
          if (expression === "location.hostname") return "dreamina.capcut.com";
          steps.push(expression.includes("/passport/web/account/info/") ? "login check" : "script");
          // Stop after the login check: the order of the first two steps is the point.
          return { data: {} };
        })
      },
      client: { Page: { setWebLifecycleState: vi.fn(async ({ state }: { state: string }) => { steps.push(`lifecycle ${state}`); }) } },
      close: vi.fn(async () => undefined)
    });
    await expect(new DreaminaProvider().textToImage({ model: { id: "high_aes_general_v40", name: "Seedream 4.0", provider: "dreamina" }, prompt: "x" }))
      .rejects.toThrow("not logged in");
    expect(steps).toEqual(["lifecycle active", "login check"]);
  });
});
