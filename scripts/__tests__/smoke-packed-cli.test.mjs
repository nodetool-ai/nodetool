/**
 * Pure helpers of `node scripts/smoke-packed-cli.mjs`. The install itself runs
 * in the publish workflow; these pin what it installs and what it checks.
 */
import { describe, expect, it } from "vitest";

import { cleanEnv, missingCommands, smokeManifest } from "../smoke-packed-cli.mjs";

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
