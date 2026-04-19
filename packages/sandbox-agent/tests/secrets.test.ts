import { beforeEach, describe, expect, it } from "vitest";
import { secretGet } from "../src/tools/secrets.js";
import { setSecretMap, _resetForTests } from "../src/secret-map.js";

beforeEach(() => {
  _resetForTests();
});

describe("secretGet", () => {
  it("returns the configured secret value", async () => {
    setSecretMap({ OPENAI_API_KEY: "sk-test" });
    await expect(secretGet({ name: "OPENAI_API_KEY" })).resolves.toEqual({
      name: "OPENAI_API_KEY",
      value: "sk-test"
    });
  });

  it("returns null for missing secrets", async () => {
    await expect(secretGet({ name: "MISSING" })).resolves.toEqual({
      name: "MISSING",
      value: null
    });
  });
});
