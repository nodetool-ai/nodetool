/**
 * Pure helpers of `node scripts/smoke-packed-cli.mjs`. The install itself runs
 * in the publish workflow; these pin what it installs and what it checks.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanEnv, existingTarballs, missingCommands, smokeManifest } from "../smoke-packed-cli.mjs";

const fixtures = [];
afterEach(() => { for (const root of fixtures.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

function releaseTarball(root, filename, name, version) {
  const staging = join(root, "staging");
  mkdirSync(join(staging, "package"), { recursive: true });
  writeFileSync(join(staging, "package/package.json"), JSON.stringify({ name, version }));
  const file = join(root, filename);
  const result = spawnSync("tar", ["-czf", file, "-C", staging, "package"], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return file;
}

describe("existingTarballs", () => {
  it("uses package manifests instead of relying on tarball filenames", () => {
    const root = mkdtempSync(join(tmpdir(), "nodetool-release-tarballs-"));
    fixtures.push(root);
    const file = releaseTarball(root, "arbitrary.tgz", "@nodetool-ai/cli", "1.2.3");
    expect(existingTarballs([{ name: "@nodetool-ai/cli", version: "1.2.3" }], root))
      .toEqual({ "@nodetool-ai/cli": file });
    expect(() => existingTarballs([{ name: "@nodetool-ai/agents", version: "1.2.3" }], root))
      .toThrow("Missing release tarballs: @nodetool-ai/agents");
    expect(() => existingTarballs([{ name: "@nodetool-ai/cli", version: "2.0.0" }], root))
      .toThrow("differs from workspace 2.0.0");
    releaseTarball(root, "duplicate.tgz", "@nodetool-ai/cli", "1.2.3");
    expect(() => existingTarballs([{ name: "@nodetool-ai/cli", version: "1.2.3" }], root))
      .toThrow("Duplicate tarball for @nodetool-ai/cli");
  });
});

describe("smokeManifest", () => {
  it("depends on the CLI tarball and overrides every other workspace", () => {
    const manifest = smokeManifest({
      "@nodetool-ai/cli": "/t/cli.tgz",
      "@nodetool-ai/agents": "/t/agents.tgz"
    });
    expect(manifest.dependencies).toEqual({ "@nodetool-ai/cli": "file:/t/cli.tgz" });
    // npm rejects an override that conflicts with a direct dependency.
    expect(manifest.overrides).toEqual({ "@nodetool-ai/agents": "file:/t/agents.tgz" });
  });
});

describe("missingCommands", () => {
  it("finds commands only at the command-list indent", () => {
    const help = [
      "Commands:",
      "  serve [options]    Start the server",
      "  mcp                Use NodeTool as an MCP server",
      "  run <dsl-file>     Run a DSL file",
      "  validate <ref>     Check a graph",
      "  debug <ref>        Run and inspect",
      "    node             (an option description, not a command)"
    ].join("\n");
    expect(missingCommands(help)).toEqual(["node"]);
  });
});

describe("cleanEnv", () => {
  it("drops keys, NodeTool settings, and the desktop session", () => {
    const env = cleanEnv("/h", {
      PATH: "/bin",
      OPENAI_API_KEY: "sk",
      SECRETS_MASTER_KEY: "k",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/bus",
      DISPLAY: ":0"
    });
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/h");
    for (const key of ["OPENAI_API_KEY", "SECRETS_MASTER_KEY", "DBUS_SESSION_BUS_ADDRESS", "DISPLAY"]) {
      expect(env).not.toHaveProperty(key);
    }
  });
});
