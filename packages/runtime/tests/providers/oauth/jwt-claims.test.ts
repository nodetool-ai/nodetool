import { describe, it, expect } from "vitest";
import {
  decodeJwtPayload,
  extractChatGptAccountId
} from "../../../src/providers/oauth/jwt-claims.js";

/** Build a (signature-less but well-formed) JWS string from a payload object. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("decodeJwtPayload", () => {
  it("decodes the payload segment of a JWT", () => {
    const jwt = makeJwt({ sub: "user-1", foo: 42 });
    expect(decodeJwtPayload(jwt)).toEqual({ sub: "user-1", foo: 42 });
  });

  it("returns null for a non-three-segment token", () => {
    expect(decodeJwtPayload("not.a-jwt")).toBeNull();
    expect(decodeJwtPayload("opaque-token")).toBeNull();
  });

  it("returns null when the payload is not valid JSON", () => {
    const header = Buffer.from("{}").toString("base64url");
    const garbage = Buffer.from("not-json").toString("base64url");
    expect(decodeJwtPayload(`${header}.${garbage}.sig`)).toBeNull();
  });

  it("returns null when the payload is a JSON array, not an object", () => {
    const header = Buffer.from("{}").toString("base64url");
    const arr = Buffer.from("[1,2,3]").toString("base64url");
    expect(decodeJwtPayload(`${header}.${arr}.sig`)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(decodeJwtPayload(undefined as unknown as string)).toBeNull();
  });
});

describe("extractChatGptAccountId", () => {
  it("reads chatgpt_account_id from the OpenAI auth namespace claim", () => {
    const jwt = makeJwt({
      sub: "user-1",
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" }
    });
    expect(extractChatGptAccountId(jwt)).toBe("acct-123");
  });

  it("falls back to a top-level chatgpt_account_id", () => {
    const jwt = makeJwt({ sub: "user-1", chatgpt_account_id: "acct-top" });
    expect(extractChatGptAccountId(jwt)).toBe("acct-top");
  });

  it("prefers the namespaced claim over a top-level one", () => {
    const jwt = makeJwt({
      chatgpt_account_id: "acct-top",
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-ns" }
    });
    expect(extractChatGptAccountId(jwt)).toBe("acct-ns");
  });

  it("returns null when no account id claim is present", () => {
    expect(extractChatGptAccountId(makeJwt({ sub: "user-1" }))).toBeNull();
  });

  it("returns null for an opaque (non-JWT) token", () => {
    expect(extractChatGptAccountId("sk-opaque-token")).toBeNull();
  });

  it("ignores a non-string account id claim", () => {
    const jwt = makeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: 123 } });
    expect(extractChatGptAccountId(jwt)).toBeNull();
  });
});
