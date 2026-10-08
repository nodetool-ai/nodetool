import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { assertSafeOpenablePath } from "../utils";

jest.mock("../state", () => ({
  serverState: { serverPort: undefined },
}));

describe("assertSafeOpenablePath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "openable-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns documents, media, and folders", () => {
    const image = path.join(dir, "render.png");
    writeFileSync(image, "png");

    expect(assertSafeOpenablePath(image)).toBe(image);
    expect(assertSafeOpenablePath(dir)).toBe(dir);
  });

  it.each(["setup.exe", "run.bat", "script.ps1", "Tool.app", "go.command", "x.sh", "a.desktop", "link.lnk", "SETUP.EXE"])(
    "refuses %s",
    (name) => {
      expect(() => assertSafeOpenablePath(path.join(dir, name))).toThrow(
        "Opening applications or scripts is not permitted",
      );
    },
  );

  it("refuses a harmless-looking symlink to a script", () => {
    const script = path.join(dir, "payload.command");
    writeFileSync(script, "#!/bin/sh\n");
    const link = path.join(dir, "notes.txt");
    symlinkSync(script, link);

    expect(() => assertSafeOpenablePath(link)).toThrow(
      "Opening applications or scripts is not permitted",
    );
  });

  if (process.platform !== "win32") {
    it("refuses an extensionless file with an execute bit", () => {
      const binary = path.join(dir, "payload");
      writeFileSync(binary, "#!/bin/sh\n");
      chmodSync(binary, 0o755);

      expect(() => assertSafeOpenablePath(binary)).toThrow(
        "Opening executable files is not permitted",
      );
    });
  }

  it("keeps the readable-path denylist", () => {
    expect(() => assertSafeOpenablePath(path.join(os.homedir(), ".ssh", "id_rsa"))).toThrow(
      "Access to this path is not permitted",
    );
  });
});
