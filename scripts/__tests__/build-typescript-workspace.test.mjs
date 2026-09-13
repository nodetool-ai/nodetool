import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getTypeScriptBuildCommand,
  typeScriptBuildEnv
} from "../build-typescript-workspace.mjs";

let fixtureRoot;
const nativeExecutable = process.platform === "win32" ? "tsc.exe" : "tsc";

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "build-tsc-"));
  const packageRoot = join(fixtureRoot, "node_modules", "typescript");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "@typescript/typescript6", version: "6.0.2", bin: { tsc6: "bin/tsc" } })
  );
  await writeFile(join(packageRoot, "bin", "tsc"), "#!/usr/bin/env node\n");
  await chmod(join(packageRoot, "bin", "tsc"), 0o755);
  const nativeRoot = join(fixtureRoot, "node_modules", "@typescript", "native");
  await mkdir(join(nativeRoot, "bin"), { recursive: true });
  await writeFile(
    join(nativeRoot, "package.json"),
    JSON.stringify({ name: "typescript", version: "7.0.2", bin: { tsc: "bin/tsc" } })
  );
  const platformRoot = join(
    fixtureRoot,
    "node_modules",
    "@typescript",
    `typescript-${process.platform}-${process.arch}`
  );
  await mkdir(join(platformRoot, "lib"), { recursive: true });
  await writeFile(
    join(platformRoot, "package.json"),
    JSON.stringify({
      name: `@typescript/typescript-${process.platform}-${process.arch}`,
      version: "7.0.2"
    })
  );
  await writeFile(join(platformRoot, "lib", nativeExecutable), "#!/usr/bin/env node\n");
  await chmod(join(platformRoot, "lib", nativeExecutable), 0o755);
});

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("build-typescript-workspace compiler command", () => {
  it("uses the JavaScript TypeScript 6 entry through Node by default", () => {
    const result = getTypeScriptBuildCommand(fixtureRoot, {
      cwd: fixtureRoot,
      version: "6"
    });
    expect(result.command).toBe(process.execPath);
    expect(result.args).toContain("--build");
    expect(result.env.NODE_OPTIONS).toMatch(/--max-old-space-size=\d+/);
  });

  it("uses the native TypeScript 7 executable directly", () => {
    const result = getTypeScriptBuildCommand(fixtureRoot, {
      cwd: fixtureRoot,
      version: "7"
    });
    expect(result.command).toBe(
      join(
        fixtureRoot,
        "node_modules",
        "@typescript",
        `typescript-${process.platform}-${process.arch}`,
        "lib",
        nativeExecutable
      )
    );
    expect(result.args).toEqual(["--build"]);
    expect(result.env.NODE_OPTIONS).toBe(process.env.NODE_OPTIONS);
  });
});
