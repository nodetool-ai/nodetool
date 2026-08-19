/**
 * The sandbox-coverage table against the router it describes.
 *
 * Two directions, and both matter. A procedure with no line means a new API
 * surface landed without anyone deciding whether sandboxed code may reach it —
 * which is how an omission stops being a decision. A line with no procedure
 * means a verdict outlived what it judged, so the table reads as reviewed when
 * part of it describes nothing.
 *
 * The `capability` verdicts are resolved against the live registry rather than
 * compared to a list, so a renamed capability fails here instead of leaving a
 * table that names a tool nobody can call.
 */

import { describe, expect, it } from "vitest";
import { findCapability } from "@nodetool-ai/agents";
import { appRouter } from "../src/trpc/router.js";
import {
  SANDBOX_API_COVERAGE,
  type SandboxApiVerdict
} from "../src/trpc/sandbox-coverage.js";

/** Every procedure path the router actually serves. */
function routerProcedures(): string[] {
  const def = (
    appRouter as unknown as { _def: { procedures: Record<string, unknown> } }
  )._def;
  return Object.keys(def.procedures).sort();
}

const verdicts = Object.entries(SANDBOX_API_COVERAGE) as Array<
  [string, SandboxApiVerdict]
>;

describe("sandbox API coverage", () => {
  it("classifies every procedure the router serves", () => {
    const classified = new Set(Object.keys(SANDBOX_API_COVERAGE));
    const unclassified = routerProcedures().filter((p) => !classified.has(p));
    expect(
      unclassified,
      "new API surface must be classified in src/trpc/sandbox-coverage.ts — " +
        "say which capability covers it, or why sandboxed code may not have it"
    ).toEqual([]);
  });

  it("has no line for a procedure the router no longer serves", () => {
    const live = new Set(routerProcedures());
    const stale = Object.keys(SANDBOX_API_COVERAGE).filter((p) => !live.has(p));
    expect(stale, "stale sandbox-coverage entries").toEqual([]);
  });

  it("names exactly one verdict per procedure", () => {
    for (const [path, verdict] of verdicts) {
      const named = (
        ["capability", "elsewhere", "withheld", "gap"] as const
      ).filter((key) => verdict[key] !== undefined);
      expect(named, path).toHaveLength(1);
    }
  });

  it("resolves every capability it names", async () => {
    const unresolved: string[] = [];
    for (const [path, verdict] of verdicts) {
      if (!verdict.capability) continue;
      if (!(await findCapability(verdict.capability))) {
        unresolved.push(`${path} → ${verdict.capability}`);
      }
    }
    expect(unresolved, "sandbox-coverage names a capability that does not exist").toEqual([]);
  });

  it("gives every withheld surface a reason worth reading", () => {
    const thin = verdicts
      .filter(([, v]) => v.withheld !== undefined && v.withheld.length < 40)
      .map(([path]) => path);
    expect(thin, "a withheld verdict states the risk, not just 'no'").toEqual([]);
  });

  it("keeps the credential and tenancy surfaces out of the sandbox", () => {
    // The lines this file exists for. Spelled out rather than derived, so
    // moving one out of `withheld` is a diff a reviewer sees.
    const mustBeWithheld = [
      "settings.secrets.get",
      "settings.secrets.upsert",
      "customProviders.save",
      "integrations.confirmLink",
      "mcpConfig.install",
      "packs.setTrust",
      "storage.signUrl",
      "credits.topup",
      "users.create",
      "worker.provision",
      "workspace.create",
      "threads.delete",
      "assets.delete"
    ];
    for (const path of mustBeWithheld) {
      expect(SANDBOX_API_COVERAGE[path]?.withheld, path).toBeTruthy();
    }
  });
});
