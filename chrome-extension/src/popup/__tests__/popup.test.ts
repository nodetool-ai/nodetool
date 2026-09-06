import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeElement {
  value: string;
  textContent: string;
  hidden: boolean;
  disabled: boolean;
  dataset: Record<string, string>;
  addEventListener: (type: string, listener: () => void) => void;
  click: () => void;
}

function element(): FakeElement {
  const listeners = new Map<string, () => void>();
  return {
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    dataset: {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    click: () => listeners.get("click")?.(),
  };
}

describe("popup chat launcher", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("attaches the active page before opening chat", async () => {
    const ids = [
      "status-dot",
      "status-label",
      "server-url",
      "save-url",
      "attach-info",
      "open-chat",
      "attach-btn",
      "detach-btn",
      "error",
    ];
    const elements = new Map(ids.map((id) => [id, element()]));
    const calls: string[] = [];

    vi.stubGlobal("document", {
      activeElement: null,
      getElementById: (id: string) => elements.get(id) ?? null,
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      close: () => calls.push("close"),
    });
    vi.stubGlobal("setInterval", vi.fn(() => 1));
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(async (message: { type: string }) => {
          calls.push(message.type);
          return {
            ok: true,
            status: {
              connection: "connected",
              serverUrl: "ws://localhost:7777/ws/extension",
              attachedTabId: 7,
              lastError: null,
            },
          };
        }),
      },
      windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
      sidePanel: {
        open: vi.fn(async () => {
          calls.push("open");
        }),
      },
    });

    await import("../popup.js");
    elements.get("open-chat")?.click();
    await vi.waitFor(() => expect(calls).toContain("open"));

    expect(calls).toEqual(["get-status", "attach", "open", "close"]);
  });
});
