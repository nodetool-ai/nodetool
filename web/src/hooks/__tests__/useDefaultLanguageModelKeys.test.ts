import type { SecretResponse } from "../../stores/ApiTypes";
import {
  FREE_TEXT_MODEL_KEY,
  defaultLanguageModelKeys,
  hasOwnLanguageKey
} from "../useDefaultLanguageModelKeys";

const secret = (
  key: string,
  source?: "user" | "server"
): SecretResponse => {
  const row: SecretResponse = { key, is_configured: true };
  if (source) {
    row.source = source;
  }
  return row;
};

const MODELS = [{ provider: "openrouter" }, { provider: "anthropic" }] as const;

describe("hasOwnLanguageKey", () => {
  it("is false when the only key comes from the server", () => {
    expect(
      hasOwnLanguageKey(MODELS, [secret("OPENROUTER_API_KEY", "server")])
    ).toBe(false);
  });

  it("is true for a key the user saved", () => {
    expect(
      hasOwnLanguageKey(MODELS, [
        secret("OPENROUTER_API_KEY", "server"),
        secret("ANTHROPIC_API_KEY", "user")
      ])
    ).toBe(true);
  });

  it("counts a key with no source as the user's", () => {
    expect(hasOwnLanguageKey(MODELS, [secret("ANTHROPIC_API_KEY")])).toBe(
      true
    );
  });

  it("ignores keys that are not configured or not for a listed provider", () => {
    expect(
      hasOwnLanguageKey(MODELS, [
        { key: "ANTHROPIC_API_KEY", is_configured: false },
        secret("FAL_API_KEY", "user")
      ])
    ).toBe(false);
  });
});

describe("defaultLanguageModelKeys", () => {
  const recommended = ["anthropic:claude-sonnet-5", FREE_TEXT_MODEL_KEY];

  it("puts the free router first when the user has no key", () => {
    expect(defaultLanguageModelKeys(recommended, false)).toEqual([
      FREE_TEXT_MODEL_KEY,
      "anthropic:claude-sonnet-5"
    ]);
  });

  it("keeps the recommended order for a user with a key", () => {
    expect(defaultLanguageModelKeys(recommended, true)).toEqual(recommended);
  });
});
