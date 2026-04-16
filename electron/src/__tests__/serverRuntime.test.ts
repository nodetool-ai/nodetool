import path from "path";

import { getDevServerCommand } from "../serverRuntime";

describe("server runtime helpers", () => {
  it("uses process.execPath with the tsx CLI entry as first arg", () => {
    expect(
      getDevServerCommand(
        "/repo",
        "/repo/packages/websocket/src/server.ts"
      )
    ).toEqual({
      command: process.execPath,
      args: [
        path.join("/repo", "node_modules", "tsx", "dist", "cli.mjs"),
        "/repo/packages/websocket/src/server.ts",
      ],
    });
  });

  it("ignores the optional nodePath argument (always uses Electron's own binary)", () => {
    expect(
      getDevServerCommand(
        "M:\\repo",
        "M:\\repo\\packages\\websocket\\src\\server.ts",
        "C:\\conda\\envs\\nodetool\\node.exe"
      )
    ).toEqual({
      command: process.execPath,
      args: [
        path.join("M:\\repo", "node_modules", "tsx", "dist", "cli.mjs"),
        "M:\\repo\\packages\\websocket\\src\\server.ts",
      ],
    });
  });
});
