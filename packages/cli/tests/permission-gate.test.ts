/**
 * The CLI's end of the permission ladder: who answers, and what persists.
 *
 * `@nodetool-ai/agents` is stubbed by this package's vitest config, so the
 * real classification map and headless gate are imported from source — the
 * point of these tests is that the CLI reuses them rather than writing a
 * second table (invariant I-1).
 *
 * The ladder itself lives in `capabilities/invoke.ts`, which pulls the whole
 * agents package in. `runLadder` below stands in for it: the three lines that
 * decide a call (session allow-list, `decidePermission`, record an
 * `allow_for_chat`), copied from `invoke.ts` so a Set rebuilt per loop shows
 * up here as a second prompt for a tool the user already allowed.
 */
import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";

vi.mock("@nodetool-ai/agents", async () => {
  const real = await import("../../agents/src/tools/tool-permissions.js");
  return { ...real };
});

const { headlessDenialReason, decidePermission, permissionCategoryFor } =
  await import("../../agents/src/tools/tool-permissions.js");
type PermissionGateOptions = import(
  "../../agents/src/tools/tool-permissions.js"
).PermissionGateOptions;

const { createCliPermissionGate, parsePermissionMode } = await import(
  "../src/permission-gate.js"
);

/** A fake stdin the test writes answers into, one line at a time. */
function fakeStdin(): PassThrough {
  return new PassThrough();
}

/** Collect what the gate writes, one entry per call. */
function recorder(): { lines: string[]; write: (text: string) => void } {
  const lines: string[] = [];
  return { lines, write: (text: string) => void lines.push(text) };
}

/** One approval request, filled in from a tool name. */
function request(toolName: string) {
  return {
    toolName,
    category: permissionCategoryFor(toolName),
    args: {},
    message: `Running ${toolName}`
  };
}

/**
 * The deciding lines of `capabilities/invoke.ts`, over a gate.
 * Returns what the call did, so a re-prompt is observable.
 */
async function runLadder(
  gate: PermissionGateOptions,
  toolName: string
): Promise<"ran" | "asked-and-ran" | "blocked" | "denied"> {
  const category = permissionCategoryFor(toolName);
  if (gate.sessionAllow.has(toolName)) return "ran";
  const decision = decidePermission(gate.mode, category);
  if (decision === "allow") return "ran";
  if (decision === "block") return "blocked";
  const answer = await gate.requestApproval(request(toolName));
  if (answer === "deny") return "denied";
  if (answer === "allow_for_chat") gate.sessionAllow.add(toolName);
  return "asked-and-ran";
}

describe("parsePermissionMode", () => {
  it("accepts the three modes and nothing else", () => {
    expect(parsePermissionMode("default")).toBe("default");
    expect(parsePermissionMode("auto")).toBe("auto");
    expect(parsePermissionMode("PLAN")).toBe("plan");
    expect(parsePermissionMode(undefined)).toBeUndefined();
    expect(() => parsePermissionMode("yolo")).toThrow(
      /--permission-mode must be one of default, auto, plan \(got "yolo"\)/
    );
  });
});

describe("a piped run", () => {
  it("gates headless in auto and prints the reason once", async () => {
    const notices = recorder();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: false,
      write: notices.write,
      input: fakeStdin()
    });

    expect(gate.mode).toBe("auto");
    expect(notices.lines).toEqual([
      headlessDenialReason("nodetool agent run")
    ]);

    // The approver is reached only by what the ladder escalates, and answers
    // the one thing a host with no user can answer honestly.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(gate.requestApproval(request("update_workflow"))).resolves.toBe(
      "deny"
    );
    await expect(gate.requestApproval(request("delete_workflow"))).resolves.toBe(
      "deny"
    );
    warn.mockRestore();

    // Once per run, not once per call.
    expect(notices.lines).toHaveLength(1);
  });

  it("keeps an explicitly asked-for mode, with nobody to ask", async () => {
    const notices = recorder();
    const gate = createCliPermissionGate({
      hostName: "nodetool-chat",
      mode: "plan",
      interactive: false,
      write: notices.write,
      input: fakeStdin()
    });

    expect(gate.mode).toBe("plan");
    await expect(runLadder(gate, "update_workflow")).resolves.toBe("blocked");
  });

  it("gates headless on a TTY when the mode asked for is auto", () => {
    const notices = recorder();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      mode: "auto",
      interactive: true,
      write: notices.write,
      input: fakeStdin()
    });

    expect(gate.mode).toBe("auto");
    expect(notices.lines).toEqual([
      headlessDenialReason("nodetool agent run")
    ]);
  });
});

describe("a run with a terminal", () => {
  it("blocks on a write call until the answer arrives", async () => {
    const notices = recorder();
    const input = fakeStdin();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: true,
      write: notices.write,
      input
    });

    expect(gate.mode).toBe("default");

    let settled = false;
    const decision = runLadder(gate, "update_workflow").then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(notices.lines.join("\n")).toContain("update_workflow (write)");

    input.write("y\n");
    await expect(decision).resolves.toBe("asked-and-ran");
  });

  it("denies on n and re-asks on an answer it does not understand", async () => {
    const input = fakeStdin();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: true,
      write: recorder().write,
      input
    });

    const denied = runLadder(gate, "delete_workflow");
    input.write("what?\n");
    await new Promise((resolve) => setImmediate(resolve));
    input.write("n\n");
    await expect(denied).resolves.toBe("denied");
  });

  it("carries `a` across every later call in the session", async () => {
    const notices = recorder();
    const input = fakeStdin();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: true,
      write: notices.write,
      input
    });

    const first = runLadder(gate, "update_workflow");
    input.write("a\n");
    await expect(first).resolves.toBe("asked-and-ran");
    expect(gate.sessionAllow.has("update_workflow")).toBe(true);

    const prompts = notices.lines.length;
    // Nothing is written to stdin for the second call: an "a" that persists
    // means this one never reaches the prompt.
    await expect(runLadder(gate, "update_workflow")).resolves.toBe("ran");
    expect(notices.lines).toHaveLength(prompts);

    // Scoped to the tool that was allowed, not to the category.
    const other = runLadder(gate, "delete_workflow");
    input.write("n\n");
    await expect(other).resolves.toBe("denied");
  });

  it("denies rather than hanging when stdin closes mid-prompt", async () => {
    const input = fakeStdin();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: true,
      write: recorder().write,
      input
    });

    const decision = runLadder(gate, "update_workflow");
    input.end();
    await expect(decision).resolves.toBe("denied");
  });

  it("reads no answer when nothing escalates", async () => {
    const input = fakeStdin();
    const gate = createCliPermissionGate({
      hostName: "nodetool agent run",
      interactive: true,
      write: recorder().write,
      input
    });

    // `get_workflow` is a read: the ladder allows it without asking, so a
    // reader nobody used must not have eaten what is waiting on stdin.
    await expect(runLadder(gate, "get_workflow")).resolves.toBe("ran");
    input.write("still here\n");
    await new Promise((resolve) => setImmediate(resolve));
    expect(input.readableLength).toBeGreaterThan(0);
  });
});
