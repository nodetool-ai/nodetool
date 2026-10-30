import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import {
  COMMAND_CATEGORIES,
  DEFAULT_CONSENT,
  type AnalyticsBatch,
  type AnalyticsTransport
} from "@nodetool-ai/analytics";
import {
  createFileAnalyticsStore,
  defaultCliAnalyticsPath
} from "@nodetool-ai/analytics/node";
import {
  CLI_FLUSH_BUDGET_MS,
  cliAnalyticsEndpoint,
  commandCategory,
  finishCliTelemetry,
  startCliTelemetry,
  trackCliEvent
} from "../src/telemetry.js";
import { registerTelemetryCommands } from "../src/commands/telemetry.js";

const CLI_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

function recorder(accept = true): AnalyticsTransport & { batches: AnalyticsBatch[] } {
  const batches: AnalyticsBatch[] = [];
  return {
    batches,
    send: async (batch) => {
      batches.push(batch);
      return accept;
    }
  };
}

let dir: string;
let storePath: string;

async function grant(path = storePath): Promise<void> {
  await createFileAnalyticsStore(path).saveConsent({
    ...DEFAULT_CONSENT,
    productAnalytics: "granted"
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nodetool-telemetry-"));
  storePath = join(dir, "telemetry.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("CLI telemetry consent", () => {
  it("is disabled by default and sends nothing", async () => {
    const transport = recorder();
    const session = startCliTelemetry("run", { env: {}, storePath, transport });
    session.track({
      event: "workflow_run",
      properties: { executionMode: "local", nodeCountBucket: "1-5" }
    });
    await session.finish();
    expect(transport.batches).toEqual([]);
    const stored = await createFileAnalyticsStore(storePath).read();
    expect(stored.queue).toEqual([]);
    expect(stored.identity).toBeNull();
  });

  it("sends coarse events once enabled", async () => {
    await grant();
    const transport = recorder();
    const session = startCliTelemetry("workflows", { env: {}, storePath, transport });
    session.track({
      event: "workflow_run_succeeded",
      properties: { executionMode: "local", nodeCountBucket: "6-20", durationBucket: "1-10s" }
    });
    await session.finish();
    const events = transport.batches.flatMap((batch) => batch.events);
    expect(events.map((event) => event.event)).toEqual([
      "cli_started",
      "workflow_run_succeeded"
    ]);
    expect(events[0]).toMatchObject({
      clientType: "npm_cli",
      properties: { commandCategory: "workflows" }
    });
  });

  it("lets NODETOOL_TELEMETRY=0 and DO_NOT_TRACK=1 win over consent", async () => {
    await grant();
    for (const env of [
      { NODETOOL_TELEMETRY: "0" },
      { NODETOOL_TELEMETRY: "false" },
      { DO_NOT_TRACK: "1" }
    ]) {
      const transport = recorder();
      const session = startCliTelemetry("run", { env, storePath, transport });
      await session.finish();
      expect(transport.batches, JSON.stringify(env)).toEqual([]);
    }
  });

  it("is not enabled by CI or by any environment variable", async () => {
    const transport = recorder();
    const session = startCliTelemetry("run", {
      env: { CI: "true", NODETOOL_TELEMETRY: "1", GITHUB_ACTIONS: "true" },
      storePath,
      transport
    });
    await session.finish();
    expect(transport.batches).toEqual([]);
  });

  it("does not report the telemetry command itself", async () => {
    await grant();
    const transport = recorder();
    const session = startCliTelemetry("telemetry", { env: {}, storePath, transport });
    await session.finish();
    expect(transport.batches).toEqual([]);
  });

  it("keeps consent outside the installed package, so upgrades keep it", () => {
    const path = defaultCliAnalyticsPath();
    expect(path.startsWith(homedir())).toBe(true);
    expect(path.startsWith(CLI_ROOT)).toBe(false);
  });

  it("writes the consent file with owner-only permissions", async () => {
    await grant();
    if (process.platform !== "win32") {
      expect(statSync(storePath).mode & 0o777).toBe(0o600);
    }
  });
});

describe("CLI telemetry payloads", () => {
  it("never serializes the working directory, argv or environment values", async () => {
    await grant();
    const transport = recorder();
    const env = {
      OPENAI_API_KEY: "sk-test-very-secret-value",
      HOME: "/home/alice-private"
    };
    const argvBefore = process.argv;
    process.argv = [
      "node",
      "nodetool",
      "workflows",
      "run",
      "/home/alice-private/plans/secret-plan.json",
      "--params",
      '{"prompt":"my private prompt"}'
    ];
    try {
      const session = startCliTelemetry("workflows", { env, storePath, transport });
      await session.finish();
    } finally {
      process.argv = argvBefore;
    }
    const serialized = JSON.stringify(transport.batches);
    expect(serialized).toContain("cli_started");
    for (const leaked of [
      process.cwd(),
      dir,
      "secret-plan",
      "my private prompt",
      "--params",
      "sk-test-very-secret-value",
      "alice-private"
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("maps commands to a closed set of categories", () => {
    expect(commandCategory("workflows")).toBe("workflows");
    expect(commandCategory("generate")).toBe("run");
    expect(commandCategory("/home/alice/script.ts")).toBe("other");
    expect(commandCategory(undefined)).toBe("other");
    for (const name of ["workflows", "zzz", "apps", "../../etc/passwd"]) {
      expect(COMMAND_CATEGORIES).toContain(commandCategory(name));
    }
  });

  it("only accepts https or local endpoints", () => {
    expect(cliAnalyticsEndpoint({})).toMatch(/^https:\/\/analytics\.nodetool\.ai\//);
    expect(
      cliAnalyticsEndpoint({ NODETOOL_ANALYTICS_ENDPOINT: "http://evil.example/x" })
    ).toMatch(/^https:\/\/analytics\.nodetool\.ai\//);
    expect(
      cliAnalyticsEndpoint({
        NODETOOL_ANALYTICS_ENDPOINT: "http://localhost:7777/api/analytics/v1/events"
      })
    ).toBe("http://localhost:7777/api/analytics/v1/events");
  });
});

describe("CLI telemetry failure isolation", () => {
  it("never writes to stdout or stderr and never changes the exit code", async () => {
    await grant();
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");
    const exitCodeBefore = process.exitCode;
    const session = startCliTelemetry("run", {
      env: {},
      storePath,
      transport: {
        send: () => Promise.reject(new Error("ECONNREFUSED"))
      }
    });
    await expect(session.finish()).resolves.toBeUndefined();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCodeBefore);
  });

  it("bounds the wait for a hung endpoint", async () => {
    await grant();
    const session = startCliTelemetry("run", {
      env: {},
      storePath,
      transport: { send: () => new Promise<boolean>(() => undefined) }
    });
    const started = Date.now();
    await session.finish();
    expect(Date.now() - started).toBeLessThan(CLI_FLUSH_BUDGET_MS + 1_000);
  });

  it("module-level helpers are safe without a session", async () => {
    expect(() =>
      trackCliEvent({ event: "workflow_created", properties: {} })
    ).not.toThrow();
    await expect(finishCliTelemetry()).resolves.toBeUndefined();
  });

  it("survives an unwritable store path", async () => {
    const session = startCliTelemetry("run", {
      env: {},
      storePath: join(dir, "missing", "\0bad", "telemetry.json"),
      transport: recorder()
    });
    await expect(session.finish()).resolves.toBeUndefined();
  });
});

describe("installation and import", () => {
  it("declares no install lifecycle scripts", () => {
    for (const pkg of [
      join(CLI_ROOT, "package.json"),
      join(CLI_ROOT, "..", "analytics", "package.json")
    ]) {
      const scripts = (JSON.parse(readFileSync(pkg, "utf8")) as {
        scripts?: Record<string, string>;
      }).scripts ?? {};
      for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
        expect(scripts[hook], `${pkg} ${hook}`).toBeUndefined();
      }
    }
  });

  it("sends nothing when the modules are imported", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.resetModules();
    await import("@nodetool-ai/analytics");
    await import("../src/telemetry.js");
    await import("../src/commands/telemetry.js");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never prompts: the telemetry code has no interactive input", () => {
    for (const file of ["src/telemetry.ts", "src/commands/telemetry.ts"]) {
      const source = readFileSync(join(CLI_ROOT, file), "utf8");
      expect(source).not.toMatch(/readline|@inquirer|promptLine|process\.stdin/);
    }
  });
});

describe("nodetool telemetry", () => {
  async function run(args: string[]): Promise<string> {
    const program = new Command();
    program.exitOverride();
    registerTelemetryCommands(program, { env: {}, configFile: storePath });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      lines.push(parts.map(String).join(" "));
    });
    await program.parseAsync(["node", "nodetool", "telemetry", ...args]);
    vi.mocked(console.log).mockRestore();
    return lines.join("\n");
  }

  it("enables, reports and disables", async () => {
    const before = JSON.parse(await run(["status", "--json"])) as { enabled: boolean };
    expect(before.enabled).toBe(false);

    await run(["enable"]);
    const enabled = JSON.parse(await run(["status", "--json"])) as {
      enabled: boolean;
      consent: string;
    };
    expect(enabled).toMatchObject({ enabled: true, consent: "granted" });

    await run(["disable"]);
    const disabled = JSON.parse(await run(["status", "--json"])) as {
      enabled: boolean;
      consent: string;
    };
    expect(disabled).toMatchObject({ enabled: false, consent: "denied" });
  });

  it("inspects without sending", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const report = JSON.parse(await run(["inspect", "--json"])) as {
      example: { event: string; clientType: string };
      pending: unknown[];
    };
    expect(report.example).toMatchObject({ event: "cli_started", clientType: "npm_cli" });
    expect(report.pending).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
