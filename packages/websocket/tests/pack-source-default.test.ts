import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("propagates resolved initialization failure with an alternate optional root and retries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-pack-source-"));
  const source = new URL("../dist/pack-source.js", import.meta.url).href;
  const alternate = join(directory, "optional", "node_modules", "@nodetool-ai", "server");
  await mkdir(alternate, { recursive: true });
  await writeFile(join(alternate, "package.json"), JSON.stringify({
    name: "@nodetool-ai/server", type: "module", exports: { import: "./index.js", default: "./index.js" }
  }));
  await writeFile(join(alternate, "index.js"), `
    globalThis.alternateLoads = (globalThis.alternateLoads ?? 0) + 1;
    export const bundledPackSource = { marker: "unexpected fallback" };
  `);
  await writeFile(join(directory, "private-server.js"), "");
  const script = join(directory, "check.mjs");
  await writeFile(script, `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    const privateUrl = new URL("./private-server.js", import.meta.url).href;
    let loads = 0;
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "@nodetool-ai/server") {
          return { url: privateUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (new URL(url).pathname === new URL(privateUrl).pathname) {
          loads += 1;
          return { format: "module", shortCircuit: true,
            source: loads === 1
              ? 'throw new Error("resolved server initialization failure");'
              : 'export const bundledPackSource = { marker: "private source" };'
          };
        }
        return nextLoad(url, context);
      }
    });
    const { loadBundledPackSource } = await import(${JSON.stringify(source)});
    assert.equal(loads, 0, "source import must remain lazy");
    await assert.rejects(loadBundledPackSource(), /resolved server initialization failure/);
    assert.equal(globalThis.alternateLoads, undefined);
    const source = await loadBundledPackSource();
    assert.equal(source.marker, "private source");
    assert.equal(await loadBundledPackSource(), source);
    assert.equal(loads, 2, "successful retry must be cached");
    assert.equal(globalThis.alternateLoads, undefined);
    hooks.deregister();
    process.stdout.write("initialization failure propagated, retry cached");
  `);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, NODETOOL_OPTIONAL_NODE_MODULES: join(directory, "optional", "node_modules") },
    stdio: ["ignore", "pipe", "pipe"], signal: controller.signal
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("initialization failure propagated, retry cached");
  } finally {
    clearTimeout(timeout);
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
