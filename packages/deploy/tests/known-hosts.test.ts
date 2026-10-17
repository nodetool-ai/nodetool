import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { isKnownHostKey } from "../src/known-hosts.js";

const KEY = Buffer.from("server-key-blob");
const OTHER = Buffer.from("attacker-key-blob");
const B64 = KEY.toString("base64");

function hashed(name: string): string {
  const salt = Buffer.from("0123456789abcdefghij");
  const hash = createHmac("sha1", salt).update(name).digest("base64");
  return `|1|${salt.toString("base64")}|${hash}`;
}

describe("isKnownHostKey", () => {
  it("accepts the recorded key for a plain host entry", () => {
    const text = `# comment\nother.example ssh-ed25519 AAAA\ndeploy.example,10.0.0.5 ssh-ed25519 ${B64}\n`;
    expect(isKnownHostKey(text, "deploy.example", 22, KEY)).toBe(true);
    expect(isKnownHostKey(text, "10.0.0.5", 22, KEY)).toBe(true);
  });

  // The man-in-the-middle case: right host name, different key.
  it("refuses a key that differs from the recorded one", () => {
    const text = `deploy.example ssh-ed25519 ${B64}`;
    expect(isKnownHostKey(text, "deploy.example", 22, OTHER)).toBe(false);
  });

  it("refuses a host with no entry", () => {
    expect(isKnownHostKey("", "deploy.example", 22, KEY)).toBe(false);
  });

  it("matches hashed entries and non-default ports", () => {
    const text = `${hashed("[deploy.example]:2222")} ssh-ed25519 ${B64}`;
    expect(isKnownHostKey(text, "deploy.example", 2222, KEY)).toBe(true);
    expect(isKnownHostKey(text, "deploy.example", 22, KEY)).toBe(false);
  });

  it("refuses a revoked key", () => {
    const text = `deploy.example ssh-ed25519 ${B64}\n@revoked deploy.example ssh-ed25519 ${B64}`;
    expect(isKnownHostKey(text, "deploy.example", 22, KEY)).toBe(false);
  });
});
