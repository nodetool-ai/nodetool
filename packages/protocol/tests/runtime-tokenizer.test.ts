import { describe, expect, it } from "vitest";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "../src/runtime-npm-packages.js";
import { missingRuntimePackageError, missingRuntimePackageOf } from "../src/missing-runtime-package.js";

describe("tokenizer runtime package", () => {
  it("provides an exact install spec and an actionable missing-package error", () => {
    expect(isRuntimeNpmPackageId("tokenizer")).toBe(true);
    expect(RUNTIME_NPM_PACKAGES.tokenizer.npmPackages).toEqual(["js-tiktoken@1.0.21"]);
    expect(RUNTIME_NPM_PACKAGES.tokenizer.packageNames).toEqual(["js-tiktoken"]);
    const error = missingRuntimePackageError("js-tiktoken", "tokenizer");
    expect(missingRuntimePackageOf(error)).toBe("tokenizer");
    expect(error.message).toContain("nodetool runtime add tokenizer");
  });
});
