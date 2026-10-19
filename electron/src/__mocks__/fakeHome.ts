import fs from "fs";
import os from "os";
import path from "path";

const originalPlatform = process.platform;

export function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

/**
 * Points `os.homedir()` at a fresh temp directory and fakes `process.platform`
 * for every test in the calling file, resetting the module registry first.
 */
export function useFakeHome(
  prefix: string,
  platform: NodeJS.Platform = "linux"
): { readonly dir: string } {
  let dir = "";

  beforeEach(() => {
    jest.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    jest.spyOn(os, "homedir").mockReturnValue(dir);
    setPlatform(platform);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.mocked(os.homedir).mockRestore();
    setPlatform(originalPlatform);
  });

  return {
    get dir() {
      return dir;
    }
  };
}
