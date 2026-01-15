import { parseCondaLockFile, checkCondaPackages, CondaPackageSpec } from "../condaPackageChecker";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

// Mock dependencies
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/mock/userData"),
    getAppPath: jest.fn().mockReturnValue("/mock/appPath"),
    isPackaged: false,
  },
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

jest.mock("../events", () => ({
  emitBootMessage: jest.fn(),
  emitServerLog: jest.fn(),
}));

jest.mock("../config", () => ({
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda/env"),
  getCondaLockFilePath: jest.fn().mockReturnValue("/mock/lock/file.yml"),
}));

jest.mock("../utils", () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));

describe("condaPackageChecker", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "conda-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("parseCondaLockFile", () => {
    it("should parse a basic lock file with package specs", async () => {
      const lockContent = `name: nodetool
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.11
  - ffmpeg>=6,<7
  - cairo
  - git
`;
      const lockPath = path.join(tempDir, "test1.yml");
      await fs.writeFile(lockPath, lockContent);

      const { fileExists } = require("../utils");
      fileExists.mockResolvedValue(true);

      // Override the mock temporarily for this test
      const originalReadFile = fs.readFile;
      jest.spyOn(fs, "readFile").mockResolvedValue(lockContent);

      const packages = await parseCondaLockFile(lockPath);

      expect(packages).toHaveLength(4);
      expect(packages[0]).toEqual({ name: "python", version: "3.11" });
      expect(packages[1]).toEqual({ name: "ffmpeg", version: ">=6,<7" });
      expect(packages[2]).toEqual({ name: "cairo" });
      expect(packages[3]).toEqual({ name: "git" });

      // Restore
      (fs.readFile as jest.Mock).mockRestore();
    });

    it("should parse package with exact version and build string", async () => {
      const lockContent = `dependencies:
  - numpy=1.24.3=py311h8e6699e_0
  - pandas=2.0.0
`;
      const lockPath = path.join(tempDir, "test2.yml");
      
      jest.spyOn(fs, "readFile").mockResolvedValue(lockContent);
      const { fileExists } = require("../utils");
      fileExists.mockResolvedValue(true);

      const packages = await parseCondaLockFile(lockPath);

      expect(packages).toHaveLength(2);
      expect(packages[0]).toEqual({
        name: "numpy",
        version: "1.24.3",
        buildString: "py311h8e6699e_0",
      });
      expect(packages[1]).toEqual({
        name: "pandas",
        version: "2.0.0",
      });

      (fs.readFile as jest.Mock).mockRestore();
    });

    it("should throw error if lock file not found", async () => {
      const { fileExists } = require("../utils");
      fileExists.mockResolvedValue(false);

      await expect(parseCondaLockFile("/nonexistent/file.yml")).rejects.toThrow(
        "Lock file not found"
      );
    });

    it("should skip pip dependencies section", async () => {
      const lockContent = `dependencies:
  - python=3.11
  - pip:
    - some-pip-package
  - cairo
`;
      jest.spyOn(fs, "readFile").mockResolvedValue(lockContent);
      const { fileExists } = require("../utils");
      fileExists.mockResolvedValue(true);

      const packages = await parseCondaLockFile("/test/path");

      expect(packages).toHaveLength(2);
      expect(packages.map(p => p.name)).toEqual(["python", "cairo"]);

      (fs.readFile as jest.Mock).mockRestore();
    });

    it("should handle empty dependencies section", async () => {
      const lockContent = `name: test
dependencies:
`;
      jest.spyOn(fs, "readFile").mockResolvedValue(lockContent);
      const { fileExists } = require("../utils");
      fileExists.mockResolvedValue(true);

      const packages = await parseCondaLockFile("/test/path");

      expect(packages).toHaveLength(0);

      (fs.readFile as jest.Mock).mockRestore();
    });
  });

  describe("CondaPackageSpec interface", () => {
    it("should represent a package with just name", () => {
      const spec: CondaPackageSpec = { name: "cairo" };
      expect(spec.name).toBe("cairo");
      expect(spec.version).toBeUndefined();
      expect(spec.buildString).toBeUndefined();
    });

    it("should represent a package with version", () => {
      const spec: CondaPackageSpec = { name: "python", version: "3.11" };
      expect(spec.name).toBe("python");
      expect(spec.version).toBe("3.11");
    });

    it("should represent a package with version constraints", () => {
      const spec: CondaPackageSpec = { name: "ffmpeg", version: ">=6,<7" };
      expect(spec.name).toBe("ffmpeg");
      expect(spec.version).toBe(">=6,<7");
    });

    it("should represent a package with full spec", () => {
      const spec: CondaPackageSpec = {
        name: "numpy",
        version: "1.24.3",
        buildString: "py311h8e6699e_0",
      };
      expect(spec.name).toBe("numpy");
      expect(spec.version).toBe("1.24.3");
      expect(spec.buildString).toBe("py311h8e6699e_0");
    });
  });
});
