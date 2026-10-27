import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  MissingRuntimePackageError,
  missingRuntimePackageError,
  missingRuntimePackageOf,
  missingRuntimePackageDetails,
  missingRuntimeDetailsOf,
  missingRuntimeText,
  quoteRuntimeInstallPath,
  runtimePackageForBinary
} from "../src/missing-runtime-package.js";

describe("missingRuntimePackageOf", () => {
  it("names the package of a missing-package error", () => {
    const error = new MissingRuntimePackageError("not installed", "whisper-cpp");
    expect(missingRuntimePackageOf(error)).toBe("whisper-cpp");
  });

  it("finds the package through a wrapping error's cause", () => {
    const inner = new MissingRuntimePackageError("not installed", "node-llama-cpp");
    const outer = new Error("Node failed", { cause: inner });
    expect(missingRuntimePackageOf(outer)).toBe("node-llama-cpp");
  });

  it("answers null for any other failure", () => {
    expect(missingRuntimePackageOf(new Error("boom"))).toBeNull();
    expect(missingRuntimePackageOf("boom")).toBeNull();
  });
});

describe("host-aware missing runtime details", () => {
  const env = { NODETOOL_OPTIONAL_NODE_MODULES: "/data/optional-node/node_modules", NODETOOL_CLI_VERSION: "0.8.3" };
  it.each([
    ["desktop", "Install PDF Libraries in Settings › Packages."],
    ["cli", "nodetool runtime add pdf-js"],
    ["source", "npm run dev:nodetool -- runtime add pdf-js"],
    ["npx", "npx -p @nodetool-ai/cli@0.8.3 nodetool runtime add pdf-js"]
  ])("names an available managed npm command on %s", (host, managed) => {
    const details = missingRuntimePackageDetails("@llamaindex/liteparse", "pdf-js", {}, { ...env, NODETOOL_HOST: host });
    expect(details).toEqual({
      runtimePackage: "pdf-js", missing: "@llamaindex/liteparse", reason: "missing", managed,
      bringYourOwn: "npm install --prefix '/data/optional-node' @llamaindex/liteparse@1.5.3 pdf-parse@2.4.5 pdf-lib@1.17.1", restart: null
    });
    expect(missingRuntimeText(details)).toBe(`The optional "@llamaindex/liteparse" package (PDF Libraries) is not installed.\n${managed}\n${details.bringYourOwn}`);
  });

  it("does not advertise the Docker build argument before its registry migration", () => {
    const details = missingRuntimePackageDetails("@llamaindex/liteparse", "pdf-js", {}, { NODETOOL_HOST: "docker" });
    expect(details.managed).toBeNull();
    expect(details.bringYourOwn).toBe("Mount a node_modules directory holding @llamaindex/liteparse@1.5.3 pdf-parse@2.4.5 pdf-lib@1.17.1, and set NODETOOL_OPTIONAL_NODE_MODULES to it.");
  });

  it("uses the existing Python install.sh command and server restart instruction", () => {
    const details = missingRuntimePackageDetails("Python worker", "python", {}, { NODETOOL_HOST: "source", NODETOOL_SERVER_PROCESS: "1" });
    expect(details.managed).toBe("curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash");
    expect(details.restart).toBe("Restart nodetool serve.");
    expect(details.bringYourOwn).toBe("Or set NODETOOL_PYTHON to a Python 3.11+ that has nodetool-core installed.");
    expect(missingRuntimePackageDetails("Python worker", "python", {}, { NODETOOL_HOST: "docker" }).restart).toBe("Restart the container.");
  });

  it("names only bring-your-own commands for unmanaged CLI install kinds", () => {
    const details = missingRuntimePackageDetails("yt-dlp", "yt-dlp", {}, { NODETOOL_HOST: "cli" });
    expect(details.managed).toBeNull();
    expect(details.bringYourOwn).toBe("Or put yt-dlp on PATH (brew install yt-dlp, apt install yt-dlp).");
    expect(missingRuntimePackageDetails("manimgx", "manimgx", {}, { NODETOOL_HOST: "cli" }).bringYourOwn)
      .toBe("Or put manimgx on PATH (uv tool install manimgx).");
    expect(runtimePackageForBinary("yt-dlp")).toBe("yt-dlp");
    // libav runs in process: no runtime package installs ffmpeg any more.
    expect(runtimePackageForBinary("ffprobe")).toBeNull();
    expect(runtimePackageForBinary("blender")).toBeNull();
  });

  it("keeps details and the reason through wrapped errors", () => {
    const error = missingRuntimePackageError("fabric", "fabric", new Error("invalid binary"), { reason: "broken" });
    expect(missingRuntimeDetailsOf(new Error("wrapped", { cause: error }))).toEqual(error.details);
    expect(error.details.reason).toBe("broken");
    expect(missingRuntimeDetailsOf(new Error("ordinary"))).toBeNull();
  });

  it.skipIf(process.platform === "win32")("quotes POSIX copy paths literally without expanding shell syntax", () => {
    const value = "/path with spaces/$dollars/`backticks`/O'Brien";
    const result = spawnSync("sh", ["-c", `${quoteRuntimeInstallPath(process.execPath, "linux")} -e 'process.stdout.write(process.argv[1])' ${quoteRuntimeInstallPath(value, "linux")}`], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(value);
  });

  it("quotes Windows PowerShell paths without doubling backslashes or expanding expressions", () => {
    const value = String.raw`C:\Users\O'Brien\with spaces\$dollars` + "\\`backticks`";
    expect(quoteRuntimeInstallPath(value, "win32")).toBe(String.raw`'C:\Users\O''Brien\with spaces\$dollars` + "\\`backticks`'");
  });
});

describe("missingRuntimePackageError", () => {
  it("names the package, the install route, and keeps the cause", () => {
    const cause = new Error("Cannot find module 'exceljs'");
    const error = missingRuntimePackageError("exceljs", "office-documents", cause);
    expect(missingRuntimePackageOf(error)).toBe("office-documents");
    expect(error.message).toContain('"exceljs"');
    expect(error.message).toContain("Office Documents");
    expect(error.cause).toBe(cause);
  });
});
