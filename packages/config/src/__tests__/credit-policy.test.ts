import { describe, it, expect } from "vitest";
import {
  CREDIT_MODELS_ENV,
  DEFAULT_SIGNUP_CREDITS,
  SIGNUP_CREDITS_ENV,
  creditModelAllowlist,
  isCreditModelAllowed,
  signupGrantCredits
} from "../credit-policy.js";

const env = (value: Record<string, string>) => value;

describe("creditModelAllowlist", () => {
  it("is null when the operator restricted nothing — the whole catalog", () => {
    expect(creditModelAllowlist({})).toBeNull();
    expect(creditModelAllowlist(env({ [CREDIT_MODELS_ENV]: "  " }))).toBeNull();
    expect(creditModelAllowlist(env({ [CREDIT_MODELS_ENV]: ", ," }))).toBeNull();
  });

  it("splits on commas, spaces, and newlines", () => {
    const allowed = creditModelAllowlist(
      env({
        [CREDIT_MODELS_ENV]:
          "nodetool/flux-schnell, nodetool/kokoro\n nodetool/hailuo-fast"
      })
    );
    expect([...allowed!].sort()).toEqual([
      "nodetool/flux-schnell",
      "nodetool/hailuo-fast",
      "nodetool/kokoro"
    ]);
  });
});

describe("isCreditModelAllowed", () => {
  it("allows everything when nothing is whitelisted", () => {
    expect(isCreditModelAllowed("nodetool/seedream", {})).toBe(true);
  });

  it("allows only what the whitelist names", () => {
    const configured = env({
      [CREDIT_MODELS_ENV]: "nodetool/flux-schnell,nodetool/kokoro"
    });
    expect(isCreditModelAllowed("nodetool/flux-schnell", configured)).toBe(true);
    expect(isCreditModelAllowed("nodetool/seedream", configured)).toBe(false);
  });
});

describe("signupGrantCredits", () => {
  it("defaults when unset or blank", () => {
    expect(signupGrantCredits({})).toBe(DEFAULT_SIGNUP_CREDITS);
    expect(signupGrantCredits(env({ [SIGNUP_CREDITS_ENV]: "  " }))).toBe(
      DEFAULT_SIGNUP_CREDITS
    );
  });

  it("reads a configured amount, floored to whole credits", () => {
    expect(signupGrantCredits(env({ [SIGNUP_CREDITS_ENV]: "1200" }))).toBe(1200);
    expect(signupGrantCredits(env({ [SIGNUP_CREDITS_ENV]: "12.9" }))).toBe(12);
  });

  it("treats zero, negatives, and junk as no welcome grant", () => {
    for (const raw of ["0", "-5", "lots"]) {
      expect(signupGrantCredits(env({ [SIGNUP_CREDITS_ENV]: raw }))).toBe(0);
    }
  });
});
