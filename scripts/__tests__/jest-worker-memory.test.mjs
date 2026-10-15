import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const jest = require.resolve("jest/bin/jest");
const webConfig = fileURLToPath(new URL("../../web/jest.config.ts", import.meta.url));

function configuration(recycle) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { pathToFileURL } from "node:url";
    const { default: config } = await import(pathToFileURL(process.argv[1]).href);
    process.stdout.write(JSON.stringify({ maxWorkers: config.maxWorkers, workerIdleMemoryLimit: config.workerIdleMemoryLimit }));
  `, webConfig], {
    encoding: "utf8",
    env: { ...process.env, NODETOOL_TEST_WORKERS: "1", NODETOOL_WEB_TEST_RECYCLE_WORKERS: recycle ? "1" : "" }
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function withFixture(check) {
  const root = mkdtempSync(join(tmpdir(), "nodetool-jest-memory-"));
  try {
    const records = join(root, "records.jsonl");
    const config = join(root, "jest.config.cjs");
    const shared = join(root, "shared.cjs");
    writeFileSync(shared, "module.exports = 7;\n");
    for (let index = 0; index < 4; index++) {
      const value = index < 3 ? 'require("./shared.cjs")' : "7";
      writeFileSync(join(root, `${index}.test.cjs`), `
        test("retains assertion ${index}", () => {
          require("node:fs").appendFileSync(${JSON.stringify(records)}, JSON.stringify({ suite: ${index}, pid: process.pid }) + "\\n");
          expect(${value}).toBe(7);
        });
      `);
    }
    const run = (recycle, args) => {
      writeFileSync(config, `module.exports = ${JSON.stringify({
        rootDir: root, testEnvironment: "node", testMatch: ["**/*.test.cjs"], maxWorkers: 1,
        // Two bytes forces a real worker replacement after each file.
        ...(recycle ? { workerIdleMemoryLimit: 2 } : {})
      })};\n`);
      return spawnSync(process.execPath, [jest, "--config", config, "--no-cache", ...args], {
        encoding: "utf8", env: process.env
      });
    };
    check({ run, shared, records });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Packed web worker memory", () => {
  it("enables the existing two GiB recycle threshold only for Packed verification", () => {
    expect(configuration(false)).toEqual({ maxWorkers: 1 });
    expect(configuration(true)).toEqual({ maxWorkers: 1, workerIdleMemoryLimit: 2 * 1024 ** 3 });
  });

  it.each([false, true])("preserves the selected manifest with related=%s", (related) => {
    withFixture(({ run, shared }) => {
      const selection = related ? ["--findRelatedTests", shared] : [];
      const manifests = [false, true].map((recycle) => {
        const result = run(recycle, [...selection, "--listTests", "--json"]);
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout).sort();
      });
      expect(manifests[0]).toHaveLength(related ? 3 : 4);
      expect(manifests[1]).toEqual(manifests[0]);
    });
  });

  it("starts a fresh worker after each file exceeds the idle threshold", () => {
    withFixture(({ run, records }) => {
      const result = run(true, []);
      expect(result.status, result.stderr).toBe(0);
      const completed = readFileSync(records, "utf8").trim().split("\n").map(JSON.parse);
      expect(completed.map((entry) => entry.suite).sort()).toEqual([0, 1, 2, 3]);
      expect(new Set(completed.map((entry) => entry.pid)).size).toBe(4);
    });
  });

  it("reports failed related assertions after recycling workers", () => {
    withFixture(({ run, shared }) => {
      writeFileSync(shared, "module.exports = 8;\n");
      const failure = run(true, ["--findRelatedTests", shared]);
      expect(failure.status, failure.stderr).toBe(1);
      expect(failure.stderr).toContain("3 failed");
    });
  });
});
