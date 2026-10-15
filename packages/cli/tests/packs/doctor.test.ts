import { describe, expect, it } from "vitest";
import { reportPackInstallation } from "../../src/packs/doctor.js";
import { classifyInstallLayout } from "../../src/packs/mode.js";
import type { InstalledPackSnapshot } from "../../src/packs/installed.js";

const snapshot: InstalledPackSnapshot = {
  mode: classifyInstallLayout({ cliRoot: "/project/node_modules/@nodetool-ai/cli", coreVersion: "1.2.3", projectHasCli: true }),
  packs: [],
  wrongVersions: [{ id: "fal", npm: "@nodetool-ai/fal-nodes", version: "1.0.0", expectedVersion: "1.2.3", packageRoot: "/project/node_modules/@nodetool-ai/fal-nodes" }],
  invalidPackages: [{ id: "game", npm: "@nodetool-ai/game-renderer", packageRoot: "/project/node_modules/@nodetool-ai/game-renderer", reason: "Missing companion package for node pack game" }]
};

describe("pack installation doctor report", () => {
  it("reports actual and expected versions before commands are introduced", () => {
    expect(reportPackInstallation(snapshot)).toEqual({ mode: "local", cliRoot: snapshot.mode.cliRoot, coreVersion: "1.2.3", healthy: false,
      issues: [
        { kind: "wrong_version", pack: "fal", npm: "@nodetool-ai/fal-nodes", version: "1.0.0", expectedVersion: "1.2.3", packageRoot: "/project/node_modules/@nodetool-ai/fal-nodes" },
        { kind: "invalid_package", pack: "game", npm: "@nodetool-ai/game-renderer", packageRoot: "/project/node_modules/@nodetool-ai/game-renderer", reason: "Missing companion package for node pack game" }
      ] });
  });

  it("reports a compatible tree as healthy without mutating its snapshot", () => {
    const clean = { ...snapshot, wrongVersions: [], invalidPackages: [] };
    expect(reportPackInstallation(clean)).toMatchObject({ healthy: true, issues: [] });
    expect(snapshot.wrongVersions[0].version).toBe("1.0.0");
  });
});
