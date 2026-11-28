/**
 * `nodetool triggers` (src/commands/triggers.ts) against a stubbed tRPC
 * client: which procedure each command calls, with what input, and what it
 * prints.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerTriggerCommands } from "../src/commands/triggers.js";

const api = vi.hoisted(() => ({
  urls: [] as string[],
  running: vi.fn(),
  listByWorkflow: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  fire: vi.fn()
}));
vi.mock("../src/api-client.js", () => ({
  createApiClient: (url: string) => {
    api.urls.push(url);
    return {
      triggers: {
        running: { query: api.running },
        listByWorkflow: { query: api.listByWorkflow },
        start: { mutate: api.start },
        stop: { mutate: api.stop },
        fire: { mutate: api.fire }
      }
    };
  }
}));

const registration = {
  id: "reg-1",
  workflow_id: "wf-1",
  node_id: "hook",
  kind: "webhook",
  enabled: true,
  last_fired_at: null,
  last_error: null,
  disabled_reason: null,
  consecutive_failures: 0,
  run_count: 2,
  expires_at: null,
  max_runs: null
};
const editorRow = {
  ...registration,
  next_fire_at: null,
  interval_seconds: null,
  cron_expr: null,
  cron_tz: null,
  webhook_token: "tok",
  webhook_secret: "s3cret"
};

let output: string[];
let savedExitCode: typeof process.exitCode;
let savedApiUrl: string | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  api.urls.length = 0;
  output = [];
  savedExitCode = process.exitCode;
  process.exitCode = undefined;
  savedApiUrl = process.env["NODETOOL_API_URL"];
  delete process.env["NODETOOL_API_URL"];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = savedExitCode;
  if (savedApiUrl === undefined) {
    delete process.env["NODETOOL_API_URL"];
  } else {
    process.env["NODETOOL_API_URL"] = savedApiUrl;
  }
});

async function invoke(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerTriggerCommands(program);
  await program.parseAsync(["node", "nodetool", "triggers", ...args]);
}

describe("nodetool triggers", () => {
  it("lists the active registrations from the local server by default", async () => {
    api.running.mockResolvedValue({ triggers: [registration] });
    await invoke(["list", "--json"]);
    expect(api.urls).toEqual(["http://127.0.0.1:7777"]);
    expect(JSON.parse(output.join("\n"))).toEqual([registration]);
  });

  it("hides webhook secrets in a workflow's list unless asked", async () => {
    api.listByWorkflow.mockResolvedValue({ triggers: [editorRow] });
    await invoke(["list", "--workflow-id", "wf-1", "--json", "--api-url", "http://host:9000"]);
    expect(api.urls).toEqual(["http://host:9000"]);
    expect(api.listByWorkflow).toHaveBeenCalledWith({ workflowId: "wf-1" });
    expect(JSON.parse(output.join("\n"))[0]).toMatchObject({
      webhook_token: "tok",
      webhook_secret: "***"
    });

    output.length = 0;
    await invoke(["list", "--workflow-id", "wf-1", "--json", "--show-secrets"]);
    expect(JSON.parse(output.join("\n"))[0].webhook_secret).toBe("s3cret");
  });

  it("registers and unregisters through the trigger start and stop procedures", async () => {
    api.start.mockResolvedValue(registration);
    api.stop.mockResolvedValue({ ...registration, enabled: false });
    await invoke(["register", "reg-1", "--json"]);
    expect(api.start).toHaveBeenCalledWith({ id: "reg-1" });
    expect(JSON.parse(output.join("\n")).enabled).toBe(true);

    output.length = 0;
    await invoke(["unregister", "reg-1", "--json"]);
    expect(api.stop).toHaveBeenCalledWith({ id: "reg-1" });
    expect(JSON.parse(output.join("\n")).enabled).toBe(false);
  });

  it("fires with a parsed payload and idempotency key and prints the job id", async () => {
    api.fire.mockResolvedValue({ job_id: "job-9" });
    await invoke(["fire", "reg-1", "--payload", '{"path":"/tmp/a.csv"}', "--idempotency-key", "k1"]);
    expect(api.fire).toHaveBeenCalledWith({
      registrationId: "reg-1",
      payload: { path: "/tmp/a.csv" },
      idempotencyKey: "k1"
    });
    expect(output).toEqual(["job-9"]);
  });

  it("refuses a payload that is not JSON without calling the server", async () => {
    await invoke(["fire", "reg-1", "--payload", "{nope"]);
    expect(api.fire).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(output.join("\n")).toContain("--payload must be JSON");
  });

  it("exits non-zero when the server refuses", async () => {
    api.fire.mockRejectedValue(new Error("Trigger is not active — activate it before firing"));
    await invoke(["fire", "reg-1"]);
    expect(process.exitCode).toBe(1);
    expect(output.join("\n")).toContain("Trigger is not active");
  });
});
