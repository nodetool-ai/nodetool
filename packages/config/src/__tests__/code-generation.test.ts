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

  it("is off until a deployment opts in", () => {
    expect(isCodeGenerationEnabled()).toBe(false);
  });

  it("is on for 1 and true", () => {
    process.env[KEY] = "1";
    expect(isCodeGenerationEnabled()).toBe(true);
    process.env[KEY] = "true";
    expect(isCodeGenerationEnabled()).toBe(true);
  });

  it("stays off for anything else", () => {
    process.env[KEY] = "0";
    expect(isCodeGenerationEnabled()).toBe(false);
    process.env[KEY] = "yes";
    expect(isCodeGenerationEnabled()).toBe(false);
  });
});
