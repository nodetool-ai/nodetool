import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

 describe("audit exception approval", () => {
   it.each([undefined, "", "  "])("does not approve an exception with reason %j", (reason) => {
     expect(addedAdvisories([adv("GHSA-new")], [], [adv("GHSA-new", { reason })])).toEqual([adv("GHSA-new")]);
   });
 });

 it("uses trusted registry and isolated caches and honors shrinkwrap at base", () => {
   const root = mkdtempSync(join(tmpdir(), "audit-fixture-"));
   try {
     for (const path of ["scripts", "mobile", ".github", "bin"]) mkdirSync(join(root, path));
     writeFileSync(join(root, "scripts/check-npm-audit.mjs"), readFileSync(new URL("../check-npm-audit.mjs", import.meta.url)));
     writeFileSync(join(root, ".github/npm-audit-allowlist.json"), JSON.stringify({ advisories: [] }));
     for (const path of ["package.json", "mobile/package.json"]) writeFileSync(join(root, path), "{}");
     writeFileSync(join(root, "npm-shrinkwrap.json"), "{}");
     writeFileSync(join(root, ".npmrc"), "registry=https://untrusted.invalid/\n");
     const calls = join(root, "calls.jsonl");
     writeFileSync(join(root, "bin/npm"), `#!/usr/bin/env node
       const fs = require('node:fs');
       if (fs.existsSync('.npmrc')) throw new Error('checkout npm configuration reached audit');
       fs.appendFileSync(process.env.AUDIT_CALLS, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
       const vuln = fs.existsSync('npm-shrinkwrap.json') ? { p: { via: [{ source: 1, name: 'p', severity: 'high', title: 't', url: 'https://github.com/advisories/GHSA-fixture' }] } } : {};
       process.stdout.write(JSON.stringify({ vulnerabilities: vuln }));
     `, { mode: 0o755 });
     const git = (args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
     git(["init"]);
     git(["add", "package.json", "mobile/package.json", "npm-shrinkwrap.json"]);
     git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "fixture"]);
     const output = execFileSync(process.execPath, ["scripts/check-npm-audit.mjs", "--base", "HEAD"], {
       cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, AUDIT_CALLS: calls }
     });
     expect(output).toContain("1 at base, 1 here");
     const invocations = readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
     expect(invocations).toHaveLength(4);
     const caches = invocations.map(({ args }) => {
       expect(args).toContain("--registry=https://registry.npmjs.org/");
       return args.find((arg) => arg.startsWith("--cache="));
     });
     expect(new Set(caches).size).toBe(4);
   } finally {
     rmSync(root, { recursive: true, force: true });
   }
 });
