/**
 * The address table of `isBlockedIpLiteral`, checked against the fixture the
 * native graph runner's test reads too (`unittests/host.cpp`), so the
 * TypeScript and native tables answer the same for every listed literal.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isBlockedIpLiteral } from "../src/safe-url.js";

interface AddressFixture {
  blocked: string[];
  allowed: string[];
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/ip-literals.json", import.meta.url), "utf8")
) as AddressFixture;

describe("isBlockedIpLiteral address table", () => {
  it.each(fixture.blocked)("blocks %s", (host) => {
    expect(isBlockedIpLiteral(host)).toBe(true);
  });

  it.each(fixture.allowed)("allows %s", (host) => {
    expect(isBlockedIpLiteral(host)).toBe(false);
  });
});
