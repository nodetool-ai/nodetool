import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  runScopedCommand,
  writeScratchFile,
  withDeploymentContext,
  minimalBaseEnv,
  makeScopedRunner,
  createScratchDir,
  removeScratchDir,
  type DeploymentContext
} from "../src/deployment-context.js";

// A tiny node program that prints the requested env vars as JSON. We use the
// real node binary so the child-env construction is exercised end-to-end with
// no docker/network dependency.
const ECHO_ENV_SCRIPT = `
const keys = process.argv.slice(1);
const out = {};
for (const k of keys) out[k] = process.env[k] ?? null;
process.stdout.write(JSON.stringify(out));
`;

async function makeCtx(
  credentials: Record<string, string> = {}
): Promise<DeploymentContext> {
  const scratchDir = await createScratchDir("nodetool-ctx-test-");
  return { userId: "u1", credentials, scratchDir };
}

describe("minimalBaseEnv", () => {
  it("is a curated allowlist, not a process.env spread", () => {
    const sentinel = "NODETOOL_DEPLOY_SECRET_SENTINEL";
    process.env[sentinel] = "leaky";
    try {
      const base = minimalBaseEnv();
      // The arbitrary secret-shaped var is NOT copied through.
      expect(base[sentinel]).toBeUndefined();
      // PATH (needed to locate tool binaries) IS passed through when present.
      if (process.env.PATH !== undefined) {
        expect(base.PATH).toBe(process.env.PATH);
      }
    } finally {
      delete process.env[sentinel];
    }
  });

  it("passes NODETOOL_CONTAINER_RUNTIME through (docker vs podman selector)", () => {
    const original = process.env.NODETOOL_CONTAINER_RUNTIME;
    process.env.NODETOOL_CONTAINER_RUNTIME = "podman";
    try {
      expect(minimalBaseEnv().NODETOOL_CONTAINER_RUNTIME).toBe("podman");
    } finally {
      if (original === undefined) delete process.env.NODETOOL_CONTAINER_RUNTIME;
      else process.env.NODETOOL_CONTAINER_RUNTIME = original;
    }
  });
});

describe("runScopedCommand", () => {
  it("places ctx.credentials in the CHILD env, never in process.env", async () => {
    const ctx = await makeCtx({ RUNPOD_API_KEY: "scoped-secret" });
    try {
      const { stdout } = await runScopedCommand(
        ctx,
        process.execPath,
        ["-e", ECHO_ENV_SCRIPT, "RUNPOD_API_KEY"]
      );
      expect(JSON.parse(stdout).RUNPOD_API_KEY).toBe("scoped-secret");
      // The credential never touched the parent process env.
      expect(process.env.RUNPOD_API_KEY).toBeUndefined();
    } finally {
      await removeScratchDir(ctx.scratchDir);
    }
  });

  it("lets opts.env (auth-file redirection) win and stay out of process.env", async () => {
    const ctx = await makeCtx({ RUNPOD_API_KEY: "k" });
    try {
      const dockerConfig = path.join(ctx.scratchDir, ".docker");
      const cloudsdk = path.join(ctx.scratchDir, "gcloud");
      const saKey = path.join(ctx.scratchDir, "sa.json");
      const { stdout } = await runScopedCommand(
        ctx,
        process.execPath,
        [
          "-e",
          ECHO_ENV_SCRIPT,
          "DOCKER_CONFIG",
          "CLOUDSDK_CONFIG",
          "GOOGLE_APPLICATION_CREDENTIALS"
        ],
        {
          env: {
            DOCKER_CONFIG: dockerConfig,
            CLOUDSDK_CONFIG: cloudsdk,
            GOOGLE_APPLICATION_CREDENTIALS: saKey
          }
        }
      );
      const env = JSON.parse(stdout);
      expect(env.DOCKER_CONFIG).toBe(dockerConfig);
      expect(env.CLOUDSDK_CONFIG).toBe(cloudsdk);
      expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(saKey);
      // None of these auth-file redirections leaked to the host env.
      expect(process.env.DOCKER_CONFIG).toBeUndefined();
      expect(process.env.CLOUDSDK_CONFIG).toBeUndefined();
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    } finally {
      await removeScratchDir(ctx.scratchDir);
    }
  });

  it("feeds stdin via opts.input (secrets stay off argv)", async () => {
    const ctx = await makeCtx();
    try {
      const readStdin = `
        let buf = "";
        process.stdin.on("data", (c) => (buf += c));
        process.stdin.on("end", () => process.stdout.write("GOT:" + buf));
      `;
      const { stdout } = await runScopedCommand(
        ctx,
        process.execPath,
        ["-e", readStdin],
        { input: "password-via-stdin" }
      );
      expect(stdout).toBe("GOT:password-via-stdin");
    } finally {
      await removeScratchDir(ctx.scratchDir);
    }
  });

  it("throws an Error including the tool and stderr on non-zero exit", async () => {
    const ctx = await makeCtx();
    try {
      await expect(
        runScopedCommand(ctx, process.execPath, [
          "-e",
          'process.stderr.write("kaboom"); process.exit(3)'
        ])
      ).rejects.toThrow(/kaboom/);
    } finally {
      await removeScratchDir(ctx.scratchDir);
    }
  });

  it("does not blindly spread process.env into the child", async () => {
    const sentinel = "NODETOOL_LEAK_CHECK";
    process.env[sentinel] = "should-not-appear";
    const ctx = await makeCtx();
    try {
      const { stdout } = await runScopedCommand(
        ctx,
        process.execPath,
        ["-e", ECHO_ENV_SCRIPT, sentinel]
      );
      expect(JSON.parse(stdout)[sentinel]).toBeNull();
    } finally {
      delete process.env[sentinel];
      await removeScratchDir(ctx.scratchDir);
    }
  });
});

describe("makeScopedRunner", () => {
  it("binds the context so leaf functions get the scoped child env", async () => {
    const ctx = await makeCtx({ FLY_API_TOKEN: "fly-tok" });
    try {
      const run = makeScopedRunner(ctx);
      const { stdout } = await run(process.execPath, [
        "-e",
        ECHO_ENV_SCRIPT,
        "FLY_API_TOKEN"
      ]);
      expect(JSON.parse(stdout).FLY_API_TOKEN).toBe("fly-tok");
    } finally {
      await removeScratchDir(ctx.scratchDir);
    }
  });
});

describe("writeScratchFile", () => {
  let ctx: DeploymentContext;

  beforeEach(async () => {
    ctx = await makeCtx();
  });

  afterEach(async () => {
    await removeScratchDir(ctx.scratchDir);
  });

  it("writes a 0600 file inside the scratch dir and returns its path", async () => {
    const p = await writeScratchFile(ctx, "sa.json", '{"k":1}');
    expect(p.startsWith(path.resolve(ctx.scratchDir))).toBe(true);
    expect(await fs.readFile(p, "utf-8")).toBe('{"k":1}');
    const mode = (await fs.stat(p)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("creates intermediate dirs inside the scratch root", async () => {
    const p = await writeScratchFile(ctx, ".docker/config.json", "{}");
    expect(p).toBe(path.join(ctx.scratchDir, ".docker", "config.json"));
    expect(await fs.readFile(p, "utf-8")).toBe("{}");
  });

  it("rejects a relPath containing .. segments", async () => {
    await expect(
      writeScratchFile(ctx, "../escape", "x")
    ).rejects.toThrow();
    await expect(
      writeScratchFile(ctx, "nested/../../escape", "x")
    ).rejects.toThrow();
  });

  it("rejects an absolute relPath", async () => {
    await expect(
      writeScratchFile(ctx, path.join(os.tmpdir(), "abs.txt"), "x")
    ).rejects.toThrow();
  });
});

describe("withDeploymentContext (scratch-dir hygiene)", () => {
  it("creates a fresh 0700 scratch dir and removes it on success", async () => {
    let captured: string | undefined;
    const result = await withDeploymentContext(
      { userId: "u1", credentials: { K: "v" } },
      async (ctx) => {
        captured = ctx.scratchDir;
        // Dir exists and is private during the call.
        const mode = (await fs.stat(ctx.scratchDir)).mode & 0o777;
        expect(mode).toBe(0o700);
        expect(ctx.userId).toBe("u1");
        expect(ctx.credentials.K).toBe("v");
        return "ok";
      }
    );
    expect(result).toBe("ok");
    await expect(fs.stat(captured!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the scratch dir even when the body throws", async () => {
    let captured: string | undefined;
    await expect(
      withDeploymentContext(
        { userId: "u1", credentials: {} },
        async (ctx) => {
          captured = ctx.scratchDir;
          await fs.stat(ctx.scratchDir); // exists mid-call
          throw new Error("body failed");
        }
      )
    ).rejects.toThrow("body failed");
    expect(captured).toBeTruthy();
    await expect(fs.stat(captured!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("hands a distinct scratch dir to each concurrent operation", async () => {
    const dirs = await Promise.all([
      withDeploymentContext(
        { userId: "a", credentials: {} },
        async (ctx) => ctx.scratchDir
      ),
      withDeploymentContext(
        { userId: "b", credentials: {} },
        async (ctx) => ctx.scratchDir
      )
    ]);
    expect(dirs[0]).not.toBe(dirs[1]);
  });
});
