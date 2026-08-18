import { describe, expect, it, vi } from "vitest";

import {
  BOT_COMMANDS,
  MESSAGES,
  handleCommand,
  isAllowedUser,
  parseCommand,
  type CommandDeps
} from "../src/commands.js";
import type { DeepLinkResult, IdentityResolution } from "../src/identity-client.js";
import { registerCommands } from "../src/register-commands.js";

const LINKED: IdentityResolution = {
  unlinked: false,
  token: "tok",
  userId: "user-7",
  expiresAtMs: 10_000_000
};

const NOT_LINKED: IdentityResolution = {
  unlinked: true,
  reason: "not-linked",
  message: "This account is not linked to a NodeTool user"
};

const LOCAL_MODE: IdentityResolution = {
  unlinked: true,
  reason: "local-mode",
  message: "This server runs in local single-user mode"
};

function deps(options: {
  resolution?: IdentityResolution;
  deepLink?: DeepLinkResult;
  unlinked?: boolean;
  health?: () => Promise<Response>;
  allowUsers?: readonly string[];
  running?: boolean;
  queueDepth?: number;
  threadId?: string | null;
}): CommandDeps & {
  identity: {
    resolve: ReturnType<typeof vi.fn>;
    linkStart: ReturnType<typeof vi.fn>;
    completeDeepLink: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  router: {
    stop: ReturnType<typeof vi.fn>;
    newThread: ReturnType<typeof vi.fn>;
    currentThreadId: ReturnType<typeof vi.fn>;
    queueDepth: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };
} {
  const identity = {
    resolve: vi.fn(async () => options.resolution ?? LINKED),
    linkStart: vi.fn(async () => ({
      code: "abc",
      url: "http://server/integrations/link?code=abc",
      expiresAt: null
    })),
    completeDeepLink: vi.fn(async () => options.deepLink ?? { ok: true as const }),
    unlink: vi.fn(async () => options.unlinked ?? true)
  };
  const router = {
    stop: vi.fn(() => options.running ?? false),
    newThread: vi.fn(() =>
      options.threadId === undefined ? "telegram-55-abcd1234-2" : options.threadId
    ),
    currentThreadId: vi.fn(() =>
      options.threadId === undefined ? "telegram-55-abcd1234-1" : options.threadId
    ),
    queueDepth: vi.fn(() => options.queueDepth ?? 0),
    isRunning: vi.fn(() => options.running ?? false)
  };
  const fetchImpl = (options.health ??
    (async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }))) as typeof fetch;
  return {
    identity,
    router,
    apiUrl: "http://server:7777",
    fetch: fetchImpl,
    allowUsers: options.allowUsers ?? []
  };
}

const INPUT = { chatId: "55", telegramUserId: "12345" };

describe("parseCommand", () => {
  it("reads a command from the leading slash and from an entity", () => {
    expect(parseCommand("/link")).toEqual({ command: "link", args: "" });
    expect(parseCommand("/start abc123")).toEqual({ command: "start", args: "abc123" });
    expect(parseCommand("/Start@NodeToolBot  code ")).toEqual({
      command: "start",
      args: "code"
    });
    expect(
      parseCommand("/new", [{ type: "bot_command", offset: 0, length: 4 }])
    ).toEqual({ command: "new", args: "" });
  });

  it("is not a command when the slash is not leading", () => {
    expect(parseCommand("what is 10/5")).toBeNull();
    expect(parseCommand("hello")).toBeNull();
  });
});

describe("isAllowedUser", () => {
  it("allows anyone when the list is empty and only listed ids otherwise", () => {
    expect(isAllowedUser([], "12345")).toBe(true);
    expect(isAllowedUser(["999"], "12345")).toBe(false);
    expect(isAllowedUser(["12345"], "12345")).toBe(true);
  });
});

describe("/start", () => {
  it("welcomes and reports the link state", async () => {
    const d = deps({ resolution: LINKED });
    const outcome = await handleCommand(d, { command: "start", args: "", ...INPUT });

    expect(outcome.replies[0]).toContain(MESSAGES.welcome);
    expect(outcome.replies[0]).toContain("Linked to NodeTool user user-7");
  });

  it("completes a deep-link code the server accepts", async () => {
    const d = deps({ deepLink: { ok: true } });
    const outcome = await handleCommand(d, { command: "start", args: "code-1", ...INPUT });

    expect(d.identity.completeDeepLink).toHaveBeenCalledWith("12345", "code-1");
    expect(outcome.replies[0]).toContain("Linked.");
  });

  it("falls back to the /link flow when the route cannot complete the code", async () => {
    const d = deps({
      deepLink: { ok: false, reason: "unsupported", message: "user_id is required" }
    });
    const outcome = await handleCommand(d, { command: "start", args: "code-1", ...INPUT });

    expect(d.identity.linkStart).toHaveBeenCalledWith("12345");
    expect(outcome.replies[0]).toContain("http://server/integrations/link?code=abc");
  });

  it("says so when the code has expired", async () => {
    const d = deps({ deepLink: { ok: false, reason: "expired", message: "expired" } });
    const outcome = await handleCommand(d, { command: "start", args: "code-1", ...INPUT });

    expect(outcome.replies[0]).toContain("Send /link to start again");
    expect(d.identity.linkStart).not.toHaveBeenCalled();
  });
});

describe("/link and /unlink", () => {
  it("mints a link URL for an unlinked account", async () => {
    const d = deps({ resolution: NOT_LINKED });
    const outcome = await handleCommand(d, { command: "link", args: "", ...INPUT });

    expect(outcome.replies[0]).toContain("http://server/integrations/link?code=abc");
  });

  it("does not mint a second link for an already-linked account", async () => {
    const d = deps({ resolution: LINKED });
    const outcome = await handleCommand(d, { command: "link", args: "", ...INPUT });

    expect(d.identity.linkStart).not.toHaveBeenCalled();
    expect(outcome.replies[0]).toContain("Already linked to NodeTool user user-7");
  });

  it("explains that a single-user server needs no link", async () => {
    const d = deps({ resolution: LOCAL_MODE });
    const outcome = await handleCommand(d, { command: "link", args: "", ...INPUT });

    expect(d.identity.linkStart).not.toHaveBeenCalled();
    expect(outcome.replies[0]).toContain("single-user");
  });

  it("unlinks, and says so when there was nothing to unlink", async () => {
    const linked = deps({});
    expect((await handleCommand(linked, { command: "unlink", args: "", ...INPUT })).replies[0]).toContain(
      "Unlinked."
    );

    const never = deps({ unlinked: false });
    expect((await handleCommand(never, { command: "unlink", args: "", ...INPUT })).replies[0]).toContain(
      "was not linked"
    );
  });
});

describe("/new, /stop and gating", () => {
  it("refuses account commands until the account is linked", async () => {
    const d = deps({ resolution: NOT_LINKED });
    for (const command of ["unlink", "new", "stop"]) {
      const outcome = await handleCommand(d, { command, args: "", ...INPUT });
      expect(outcome.replies).toEqual([MESSAGES.needsLink]);
    }
    expect(d.router.newThread).not.toHaveBeenCalled();
  });

  it("rotates the thread", async () => {
    const d = deps({});
    const outcome = await handleCommand(d, { command: "new", args: "", ...INPUT });

    expect(outcome.replies[0]).toBe("New thread: telegram-55-abcd1234-2");
  });

  it("says there is no conversation yet when nothing has run", async () => {
    const d = deps({ threadId: null });
    const outcome = await handleCommand(d, { command: "new", args: "", ...INPUT });

    expect(outcome.replies[0]).toContain("next message starts a fresh thread");
  });

  it("stops a running turn and reports an idle one", async () => {
    const running = deps({ running: true });
    expect((await handleCommand(running, { command: "stop", args: "", ...INPUT })).replies).toEqual([
      MESSAGES.stopping
    ]);

    const idle = deps({ running: false });
    expect((await handleCommand(idle, { command: "stop", args: "", ...INPUT })).replies).toEqual([
      MESSAGES.nothingRunning
    ]);
  });

  it("refuses an account outside the allowlist before anything else", async () => {
    const d = deps({ allowUsers: ["999"] });
    const outcome = await handleCommand(d, { command: "start", args: "", ...INPUT });

    expect(outcome.replies).toEqual([MESSAGES.notAllowed]);
    expect(d.identity.resolve).not.toHaveBeenCalled();
  });

  it("answers an unknown command", async () => {
    const d = deps({});
    expect((await handleCommand(d, { command: "sing", args: "", ...INPUT })).replies).toEqual([
      MESSAGES.unknownCommand
    ]);
  });
});

describe("/status", () => {
  it("reports connectivity, link state, thread and queue depth", async () => {
    const d = deps({ queueDepth: 2, running: true });
    const outcome = await handleCommand(d, { command: "status", args: "", ...INPUT });
    const text = outcome.replies[0];

    expect(text).toContain("Server: ok at http://server:7777");
    expect(text).toContain("Account: Linked to NodeTool user user-7");
    expect(text).toContain("Thread: telegram-55-abcd1234-1");
    expect(text).toContain("Turn: running");
    expect(text).toContain("Queued: 2");
  });

  it("reports an unreachable server instead of failing", async () => {
    const d = deps({
      health: async () => {
        throw new Error("ECONNREFUSED");
      }
    });
    const outcome = await handleCommand(d, { command: "status", args: "", ...INPUT });

    expect(outcome.replies[0]).toContain("unreachable (ECONNREFUSED)");
  });
});

describe("registerCommands", () => {
  it("publishes the command list and is idempotent", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://tg.test/botbot-token/setMyCommands");
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }) as typeof fetch;

    const first = await registerCommands("bot-token", {
      fetch: fetchImpl,
      baseUrl: "https://tg.test"
    });
    const second = await registerCommands("bot-token", {
      fetch: fetchImpl,
      baseUrl: "https://tg.test"
    });

    expect(first).toEqual(BOT_COMMANDS);
    expect(second).toEqual(first);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({ commands: BOT_COMMANDS });
    expect(BOT_COMMANDS.map((c) => c.command)).toEqual([
      "start",
      "link",
      "unlink",
      "new",
      "stop",
      "status"
    ]);
  });

  it("surfaces a Bot API failure", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
        status: 401
      })) as typeof fetch;

    await expect(
      registerCommands("bad-token", { fetch: fetchImpl, baseUrl: "https://tg.test" })
    ).rejects.toThrow(/setMyCommands failed \(401\): Unauthorized/);
  });
});
