import path from "path";

import { getDevServerCommand } from "../serverRuntime";

describe("server runtime helpers", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
    });
  });

  it("uses the provided Node binary plus the tsx cli entry on Windows", () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
    });

    expect(
      getDevServerCommand(
        "M:\\repo",
        "M:\\repo\\packages\\websocket\\src\\server.ts",
        "C:\\conda\\envs\\nodetool\\node.exe"
      )
    ).toEqual({
      command: "C:\\conda\\envs\\nodetool\\node.exe",
      args: [
        path.join("M:\\repo", "node_modules", "tsx", "dist", "cli.mjs"),
        "M:\\repo\\packages\\websocket\\src\\server.ts",
      ],
    });
  });

  it("uses the tsx binary directly on non-Windows platforms", () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
    });

    expect(getDevServerCommand("/repo", "/repo/packages/websocket/src/server.ts")).toEqual({
      command: path.join("/repo", "node_modules", ".bin", "tsx"),
      args: ["/repo/packages/websocket/src/server.ts"],
    });
  });
});
