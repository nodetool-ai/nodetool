// Self-hosted rollout harness: `DockerDeployer.plan()` and `apply()` run with
// the real SSHConnection, the real DockerRunGenerator and the real
// StateManager on a temp deployment.yaml. Only the ssh2 transport is replaced,
// through `_setClientCtorForTest`, by a fake host that records every command
// and answers it from a small simulated Docker state.
//
// The cases assert the exact command sequence a rollout issues over SSH, so a
// change to a mount, an env var, the stop timeout, the conflict cleanup or the
// health probe fails here. Keyless and deterministic: no network, no Docker,
// timers faked. A command the fake host does not recognise exits 127 and is
// recorded in `host.unexpected`, which every case asserts is empty.

import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DockerDeploymentSchema } from "../src/deployment-config.js";
import { DockerDeployer } from "../src/self-hosted.js";
import { _setClientCtorForTest, type SSH2ClientConstructor } from "../src/ssh.js";
import { StateManager } from "../src/state.js";

const HOST = "203.0.113.10";
const NAME = "fixture-prod";
const IMAGE = "ghcr.io/nodetool-ai/nodetool:fixture";
const TOKEN = "fixture-server-token";
const MASTER_KEY = "fixture-master-key";

/** The runtime probe a remote rollout prefixes to every container command. */
const RT =
  "$((command -v docker >/dev/null 2>&1 && echo docker) || " +
  "(command -v podman >/dev/null 2>&1 && echo podman) || echo docker)";

interface HostResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

/** A simulated remote Docker host reached over the fake ssh2 transport. */
class FakeHost {
  readonly commands: string[] = [];
  readonly unexpected: string[] = [];
  readonly connects: Array<Record<string, unknown>> = [];
  imagePresent = true;
  healthy = true;
  /** Container names that exist on the host. */
  readonly containers = new Set<string>();
  /** Containers that publish the app's host port. */
  readonly publishing = new Set<string>();

  run(command: string): HostResult {
    this.commands.push(command);
    if (command.startsWith("mkdir -p ")) return { code: 0 };
    if (command.startsWith("curl -fsS ")) {
      return this.healthy
        ? { code: 0, stdout: '{"status":"ok"}' }
        : { code: 7, stderr: "curl: (7) Failed to connect to 127.0.0.1 port 8000" };
    }
    if (!command.startsWith(`${RT} `)) return this.reject(command);
    const rest = command.slice(RT.length + 1);

    let match: RegExpExecArray | null;
    if ((match = /^images -q '(.+)'$/.exec(rest))) {
      return { code: 0, stdout: this.imagePresent && match[1] === IMAGE ? "sha256:f1x7ure\n" : "" };
    }
    if (rest.startsWith("run --rm --user 0 --entrypoint chown ")) return { code: 0 };
    if ((match = /^ps -a -q -f name='(.+)'$/.exec(rest))) {
      return { code: 0, stdout: this.containers.has(match[1]) ? "c0ffee000001\n" : "" };
    }
    if (/^ps -a --filter publish=8000 --format '\{\{\.Names\}\}'$/.test(rest)) {
      return { code: 0, stdout: [...this.publishing].map((n) => `${n}\n`).join("") };
    }
    if ((match = /^ps -f name='(.+)' --format /.exec(rest))) {
      return {
        code: 0,
        stdout: this.containers.has(match[1])
          ? `${match[1]} Up 2 seconds 0.0.0.0:8000->7777/tcp\n`
          : "",
      };
    }
    if ((match = /^stop -t 270 '(.+)'$/.exec(rest))) {
      return this.containers.has(match[1]) ? { code: 0 } : { code: 1, stderr: "No such container" };
    }
    if ((match = /^rm '(.+)'$/.exec(rest))) {
      this.containers.delete(match[1]);
      this.publishing.delete(match[1]);
      return { code: 0 };
    }
    if ((match = /^run \\\n {2}-d \\\n {2}--name (\S+) /.exec(rest))) {
      this.containers.add(match[1]);
      this.publishing.add(match[1]);
      return { code: 0, stdout: "5eed5eed5eed5eed\n" };
    }
    return this.reject(command);
  }

  private reject(command: string): HostResult {
    this.unexpected.push(command);
    return { code: 127, stderr: "fake host: unrecognised command" };
  }
}

/** An ssh2 `Client` constructor bound to a fake host. */
function fakeClientCtor(host: FakeHost): SSH2ClientConstructor {
  class FakeClient extends EventEmitter {
    // SSHConnection reads this to decide whether to reconnect.
    readonly _sock = { writable: true };
    connect(config: Record<string, unknown>): void {
      host.connects.push(config);
      queueMicrotask(() => this.emit("ready"));
    }
    exec(
      command: string,
      callback: (err: Error | undefined, channel: unknown) => void
    ): void {
      const result = host.run(command);
      const channel = Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
        close: () => {},
      });
      callback(undefined, channel);
      queueMicrotask(() => {
        if (result.stdout) channel.emit("data", Buffer.from(result.stdout));
        if (result.stderr) channel.stderr.emit("data", Buffer.from(result.stderr));
        channel.emit("close", result.code);
      });
    }
    sftp(): void {
      throw new Error("fake host: sftp is not part of a docker rollout");
    }
    end(): void {}
  }
  return FakeClient as unknown as SSH2ClientConstructor;
}

function rawDeployment(overrides: { port?: number; environment?: Record<string, string> } = {}) {
  return {
    type: "docker",
    host: HOST,
    ssh: { user: "deploy", password: "fixture-password" },
    paths: { workspace: "/srv/nodetool/workspace", hf_cache: "/srv/nodetool/hf-cache" },
    image: { name: "ghcr.io/nodetool-ai/nodetool", tag: "fixture" },
    container: {
      name: "app",
      port: overrides.port ?? 7777,
      environment: overrides.environment ?? { SECRETS_MASTER_KEY: MASTER_KEY },
    },
    server_auth_token: TOKEN,
  };
}

let workDir: string;
let configPath: string;
let host: FakeHost;
let savedRuntime: string | undefined;

async function writeConfig(deployment: ReturnType<typeof rawDeployment>): Promise<void> {
  await writeFile(configPath, yaml.dump({ version: "2.0", deployments: { [NAME]: deployment } }));
}

function deployer(deployment: ReturnType<typeof rawDeployment>): DockerDeployer {
  return new DockerDeployer(
    NAME,
    DockerDeploymentSchema.parse(deployment),
    new StateManager(configPath)
  );
}

/** The real timer, captured before any case fakes the clock. */
const realSetTimeout = globalThis.setTimeout;

/**
 * Settle a promise whose code sleeps by stepping the fake clock: fire the next
 * fake timer when one is pending, otherwise yield real time so file I/O on the
 * state file can finish. Fails closed after ten seconds of real time.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const tracked = promise.finally(() => {
    done = true;
  });
  tracked.catch(() => {});
  const deadline = Date.now() + 10_000;
  while (!done && Date.now() < deadline) {
    if (vi.getTimerCount() > 0) {
      await vi.advanceTimersToNextTimerAsync();
    } else {
      await new Promise((resolve) => realSetTimeout(resolve, 1));
    }
  }
  if (!done) {
    throw new Error(
      `settle: operation did not finish; last commands: ${JSON.stringify(host.commands.slice(-3))}`
    );
  }
  return tracked;
}

async function readState(): Promise<Record<string, unknown>> {
  const config = yaml.load(await readFile(configPath, "utf-8")) as {
    deployments: Record<string, { state: Record<string, unknown> }>;
  };
  return config.deployments[NAME].state;
}

const MKDIR =
  "mkdir -p '/srv/nodetool/workspace' '/srv/nodetool/workspace/data' " +
  "'/srv/nodetool/workspace/assets' '/srv/nodetool/workspace/temp' '/srv/nodetool/hf-cache'";
const IMAGES = `${RT} images -q '${IMAGE}'`;
const CHOWN =
  `${RT} run --rm --user 0 --entrypoint chown -v '/srv/nodetool/workspace:/workspace' ` +
  `'${IMAGE}' 1000:1000 /workspace /workspace/data /workspace/assets /workspace/temp`;
const PS_NAME = `${RT} ps -a -q -f name='nodetool-app'`;
const PS_PUBLISH = `${RT} ps -a --filter publish=8000 --format '{{.Names}}'`;
const STATUS = `${RT} ps -f name='nodetool-app' --format '{{.Names}} {{.Status}} {{.Ports}}'`;
const HEALTH = "curl -fsS 'http://127.0.0.1:8000/health'";

function runCommand(environment: Record<string, string>): string {
  const env = {
    ...environment,
    PORT: "7777",
    NODETOOL_API_URL: "http://localhost:7777",
    HF_HUB_CACHE: "/hf-cache",
    DB_PATH: "/workspace/nodetool.db",
    VECTORSTORE_DB_PATH: "/workspace/vectorstore.db",
    ASSET_FOLDER: "/workspace/assets",
    USERS_FILE: "/workspace/users.json",
    SERVER_AUTH_TOKEN: TOKEN,
  };
  return [
    `${RT} run`,
    "-d",
    "--name nodetool-app",
    "--restart unless-stopped",
    "-p 8000:7777",
    // Values with no shell metacharacters go unquoted (shlex.quote rules).
    "-v /srv/nodetool/workspace:/workspace",
    "-v /srv/nodetool/hf-cache:/hf-cache:ro",
    ...Object.entries(env).map(([k, v]) => `-e ${k}=${v}`),
    '--health-cmd="curl -f http://localhost:7777/health || exit 1" --health-interval=30s ' +
      "--health-timeout=10s --health-retries=3 --health-start-period=40s",
    IMAGE,
  ].join(" \\\n  ");
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  savedRuntime = process.env.NODETOOL_CONTAINER_RUNTIME;
  delete process.env.NODETOOL_CONTAINER_RUNTIME;
  workDir = await mkdtemp(join(tmpdir(), "nodetool-rollout-harness-"));
  configPath = join(workDir, "deployment.yaml");
  host = new FakeHost();
  _setClientCtorForTest(fakeClientCtor(host));
});

afterEach(async () => {
  _setClientCtorForTest(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedRuntime === undefined) delete process.env.NODETOOL_CONTAINER_RUNTIME;
  else process.env.NODETOOL_CONTAINER_RUNTIME = savedRuntime;
  await rm(workDir, { recursive: true, force: true });
});

describe("self-hosted rollout harness — docker over SSH", () => {
  it("plans an initial deployment and a dry run touches no host", async () => {
    const deployment = rawDeployment();
    await writeConfig(deployment);
    const d = deployer(deployment);

    const plan = await d.plan();
    expect(plan).toEqual({
      deployment_name: NAME,
      host: HOST,
      type: "docker",
      changes: ["Initial deployment - will create all resources"],
      will_create: [
        "App container: nodetool-app",
        "Directory: /srv/nodetool/workspace",
        "Directory: /srv/nodetool/hf-cache",
        "Container: nodetool-app",
      ],
      will_update: [],
      will_destroy: [],
    });
    await expect(d.apply({ dryRun: true })).resolves.toEqual(plan);
    expect(host.connects).toEqual([]);
    expect(host.commands).toEqual([]);
  });

  it("applies a first rollout with the exact SSH command sequence and records state", async () => {
    const deployment = rawDeployment();
    await writeConfig(deployment);
    const d = deployer(deployment);

    const result = await settle(d.apply());

    expect(host.connects).toHaveLength(1);
    expect(host.connects[0]).toMatchObject({
      host: HOST,
      port: 22,
      username: "deploy",
      password: "fixture-password",
    });
    expect(host.commands).toEqual([
      MKDIR,
      IMAGES,
      CHOWN,
      PS_NAME,
      PS_PUBLISH,
      runCommand({ SECRETS_MASTER_KEY: MASTER_KEY }),
      STATUS,
      HEALTH,
    ]);
    expect(host.unexpected).toEqual([]);
    expect(result).toMatchObject({ status: "success", errors: [] });
    // The run command carries the auth token and master key; the step log
    // must not echo either.
    const steps = JSON.stringify((result as { steps: string[] }).steps);
    expect(steps).not.toContain(TOKEN);
    expect(steps).not.toContain(MASTER_KEY);

    const state = await readState();
    expect(state).toMatchObject({
      status: "running",
      container_name: "nodetool-app",
      url: `http://${HOST}:8000`,
    });
    expect(state.container_run_hash).toMatch(/^[0-9a-f]{64}$/);

    // The same config again plans no change.
    const replan = await d.plan();
    expect(replan.changes).toEqual([]);
    expect(replan.will_update).toEqual([]);
  });

  it("redeploys a changed config: replaces the old container and a legacy one on the port", async () => {
    const first = rawDeployment();
    await writeConfig(first);
    await settle(deployer(first).apply());
    host.commands.length = 0;
    host.publishing.add("nodetool-legacy");
    host.containers.add("nodetool-legacy");

    const changed = rawDeployment({
      environment: { SECRETS_MASTER_KEY: MASTER_KEY, LOG_LEVEL: "DEBUG" },
    });
    const d = deployer(changed);
    const plan = await d.plan();
    expect(plan.changes).toEqual(["Container configuration has changed"]);
    expect(plan.will_update).toEqual(["App container"]);

    await settle(d.apply());

    expect(host.commands).toEqual([
      MKDIR,
      IMAGES,
      CHOWN,
      PS_NAME,
      `${RT} stop -t 270 'nodetool-app'`,
      `${RT} rm 'nodetool-app'`,
      PS_PUBLISH,
      `${RT} stop -t 270 'nodetool-legacy'`,
      `${RT} rm 'nodetool-legacy'`,
      runCommand({ SECRETS_MASTER_KEY: MASTER_KEY, LOG_LEVEL: "DEBUG" }),
      STATUS,
      HEALTH,
    ]);
    expect(host.unexpected).toEqual([]);
    expect(host.containers).toEqual(new Set(["nodetool-app"]));
  });

  it("fails the rollout and records the error state when the health probe never passes", async () => {
    const deployment = rawDeployment();
    await writeConfig(deployment);
    host.healthy = false;

    await expect(settle(deployer(deployment).apply())).rejects.toThrow(
      "Deployment health check failed: health check failed: curl: (7)"
    );

    // Thirty probe rounds, each a status read and a curl.
    expect(host.commands.filter((c) => c === HEALTH)).toHaveLength(30);
    expect(host.commands.filter((c) => c === STATUS)).toHaveLength(30);
    expect(host.unexpected).toEqual([]);
    expect((await readState()).status).toBe("error");
  });

  it("refuses an unknown command, so an unplanned step fails the case", () => {
    expect(host.run("rm -rf /").code).toBe(127);
    expect(host.unexpected).toEqual(["rm -rf /"]);
  });
});
