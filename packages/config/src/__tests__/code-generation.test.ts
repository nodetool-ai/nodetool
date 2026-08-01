import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isCodeGenerationEnabled } from "../code-generation.js";

const KEY = "NODETOOL_CODE_GENERATION";

describe("isCodeGenerationEnabled", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    delete process.env[KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("is on unless a deployment opts out", () => {
    expect(isCodeGenerationEnabled()).toBe(true);
  });

  it("is off for the falsy spellings", () => {
    for (const value of ["0", "false", "off", "no", "OFF"]) {
      process.env[KEY] = value;
      expect(isCodeGenerationEnabled()).toBe(false);
    }
  });

  it("stays on for anything else, including an empty value", () => {
    for (const value of ["1", "true", "", "  ", "yes"]) {
      process.env[KEY] = value;
      expect(isCodeGenerationEnabled()).toBe(true);
    }
  });
});
