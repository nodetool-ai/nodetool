import { describe, expect, it } from "vitest";

import {
  addedAdvisories,
  advisoriesFromAudit,
  checkAllowlist,
  mergeAllowlist,
} from "../check-npm-audit.mjs";

const report = {
  vulnerabilities: {
    "proxy-addr": {
      via: [{ source: 1, name: "proxy-addr", severity: "critical", title: "IP spoofing", url: "https://github.com/advisories/GHSA-aaaa" }],
    },
    express: { via: ["proxy-addr"] },
    "js-yaml": {
      via: [
        { source: 2, name: "js-yaml", severity: "moderate", title: "minor", url: "https://github.com/advisories/GHSA-bbbb" },
        { source: 3, name: "js-yaml", severity: "high", title: "DoS", url: "https://github.com/advisories/GHSA-cccc" },
      ],
    },
  },
};

const adv = (id, extra = {}) => ({ project: "root", id, package: "p", severity: "high", title: "t", url: "u", ...extra });

describe("check-npm-audit", () => {
  it("keeps only high and critical advisories, once each, keyed by GHSA id", () => {
    const found = advisoriesFromAudit(report, "root");
    expect(found.map((a) => `${a.package}:${a.id}:${a.severity}`)).toEqual([
      "proxy-addr:GHSA-aaaa:critical",
      "js-yaml:GHSA-cccc:high",
    ]);
  });

  it("fails closed when npm audit reports an error", () => {
    expect(() => advisoriesFromAudit({ error: { summary: "registry down" } }, "mobile")).toThrow(/registry down/);
  });

  it("reports only advisories the diff adds, not ones already at base or allowlisted", () => {
    const head = [adv("GHSA-old"), adv("GHSA-new"), adv("GHSA-listed"), adv("GHSA-old", { project: "mobile" })];
    const base = [adv("GHSA-old")];
    const allowlist = [adv("GHSA-listed", { reason: "unreachable" })];
    expect(addedAdvisories(head, base, allowlist).map((a) => `${a.project}:${a.id}`)).toEqual([
      "root:GHSA-new",
      "mobile:GHSA-old",
    ]);
  });

  it("separates unlisted, fixed, and unexplained allowlist entries", () => {
    const current = [adv("GHSA-a"), adv("GHSA-b")];
    const allowlist = [adv("GHSA-b", { reason: "  " }), adv("GHSA-gone", { reason: "x" })];
    const { unlisted, stale, unexplained } = checkAllowlist(current, allowlist);
    expect(unlisted.map((a) => a.id)).toEqual(["GHSA-a"]);
    expect(stale.map((a) => a.id)).toEqual(["GHSA-gone"]);
    expect(unexplained.map((a) => a.id)).toEqual(["GHSA-b"]);
  });

  it("--write keeps existing reasons and drops fixed advisories", () => {
    const merged = mergeAllowlist([adv("GHSA-a"), adv("GHSA-b")], [adv("GHSA-b", { reason: "why" }), adv("GHSA-gone", { reason: "x" })]);
    expect(merged.map((a) => [a.id, a.reason])).toEqual([
      ["GHSA-a", ""],
      ["GHSA-b", "why"],
    ]);
  });
});
