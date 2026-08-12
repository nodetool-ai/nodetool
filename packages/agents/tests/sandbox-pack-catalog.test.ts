/**
 * Tests for `installedSandboxPacks`.
 *
 * An authoring prompt may advertise only packs this machine installed. A
 * prompt that names a pack nobody installed sends the agent after an import
 * that cannot resolve, which is the failure this catalog exists to prevent.
 */
import { describe, it, expect } from "vitest";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import type { SandboxModuleSummary } from "@nodetool-ai/protocol";

import { installedSandboxPacks } from "../src/prompts/sandbox-pack-catalog.js";

function catalogOf(
  summaries: readonly Partial<SandboxModuleSummary>[]
): SandboxModuleCatalog {
  const full = summaries.map((summary) => ({
    specifier: "@nodetool-ai/sandbox-x",
    packName: "@nodetool-ai/sandbox-x",
    kind: "host" as const,
    contentDigest: "digest",
    ...summary
  }));
  return {
    summaries: () => full,
    diagnostics: () => [],
    resolveForExecution: () => ({ modules: [], statuses: [] }),
    authorizeDelivery: () =>
      Promise.resolve({
        authorized: false as const,
        reason: "not-found" as const,
        message: "no"
      })
  };
}

describe("installedSandboxPacks", () => {
  it("reports every installed pack with its own description, sorted", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        {
          specifier: "@nodetool-ai/sandbox-yaml",
          packName: "@nodetool-ai/sandbox-yaml",
          description: "Parse and write YAML."
        },
        {
          specifier: "@nodetool-ai/sandbox-csv",
          packName: "@nodetool-ai/sandbox-csv",
          description: "Parse and write CSV."
        }
      ])
    );

    expect(packs).toEqual([
      {
        specifier: "@nodetool-ai/sandbox-csv",
        summary: "Parse and write CSV."
      },
      {
        specifier: "@nodetool-ai/sandbox-yaml",
        summary: "Parse and write YAML."
      }
    ]);
  });

  it("answers nothing for an empty catalog", () => {
    expect(installedSandboxPacks(catalogOf([]))).toEqual([]);
  });

  it("answers nothing when there is no catalog at all", () => {
    expect(installedSandboxPacks(undefined)).toEqual([]);
    expect(installedSandboxPacks()).toEqual([]);
  });

  it("flattens a multi-line description and caps it", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        { specifier: "@a/one", description: " Parses\n   things.  " },
        { specifier: "@a/two", description: "x".repeat(400) }
      ])
    );

    expect(packs[0]?.summary).toBe("Parses things.");
    expect(packs[1]?.summary).toHaveLength(120);
  });

  it("keeps a pack that ships no description, with an empty summary", () => {
    const packs = installedSandboxPacks(catalogOf([{ specifier: "@a/one" }]));
    expect(packs).toEqual([{ specifier: "@a/one", summary: "" }]);
  });

  it("reports one entry per specifier", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        { specifier: "@a/one", description: "First." },
        { specifier: "@a/one", description: "Duplicate." }
      ])
    );
    expect(packs).toEqual([{ specifier: "@a/one", summary: "First." }]);
  });
});
