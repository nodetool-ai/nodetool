import { describe, expect, it } from "vitest";
import {
  MissingRuntimePackageError,
  missingRuntimePackageError,
  missingRuntimePackageOf
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
