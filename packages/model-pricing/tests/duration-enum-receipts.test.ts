/**
 * Audit: a video endpoint's declared duration enum never offers a clip length
 * the provider does not publish a price for.
 *
 * The generated manifests state what each endpoint accepts; the GenSpend
 * catalog records `clip_seconds` — the lengths the provider's own published
 * price grid quotes. Where both exist they must agree in one direction: every
 * duration the node can be put into is one the catalog can price. The reverse
 * is allowed — a provider may receipt a length its API does not expose.
 *
 * The audit asserts it found its targets before asserting they pass, so it
 * cannot go green by matching nothing: a manifest rename, a `duration` field
 * that stops being read, or a catalog refresh that drops `clip_seconds` all
 * fail here rather than quietly reducing the audit to zero comparisons.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import genspend from "../src/generated/genspend-pricing.json" with { type: "json" };

const manifest = (pkg: string, file: string): ManifestNode[] =>
  JSON.parse(
    readFileSync(new URL(`../../${pkg}/src/${file}`, import.meta.url), "utf8")
  ) as ManifestNode[];

interface ManifestNode {
  outputType?: string;
  endpointId?: string;
  modelId?: string;
  inputFields?: Array<{
    name?: string;
    apiParamName?: string;
    enumValues?: unknown[];
  }>;
  fields?: Array<{ name?: string; values?: unknown[] }>;
}

const SOURCES: Array<[string, ManifestNode[], "endpointId" | "modelId"]> = [
  ["fal_ai", manifest("fal-nodes", "fal-manifest.json"), "endpointId"],
  ["kie", manifest("kie-nodes", "kie-manifest.json"), "modelId"],
  [
    "atlascloud",
    manifest("atlascloud-nodes", "atlascloud-manifest.json"),
    "modelId"
  ]
];

/**
 * Seconds from one declared option, mirroring `videoConstraints()` in
 * `@nodetool-ai/runtime` — which is what turns these enums into the durations
 * a picker offers. Kept in step deliberately: an audit that parsed the enum
 * more strictly than the app does would pass over the values users can reach.
 */
function durationSeconds(value: unknown): number | undefined {
  const trimmed = String(value).trim();
  if (trimmed === "") return undefined;
  const digits =
    /^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/i.exec(trimmed)?.[1] ?? trimmed;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function declaredDurations(node: ManifestNode): number[] {
  const fromInput = (node.inputFields ?? []).find(
    (f) => (f.apiParamName ?? f.name) === "duration"
  )?.enumValues;
  const fromField = (node.fields ?? []).find((f) => f.name === "duration")
    ?.values;
  const raw = fromInput?.length ? fromInput : (fromField ?? []);
  return raw
    .map(durationSeconds)
    .filter((d): d is number => d !== undefined && d > 0);
}

const prices = (genspend as { prices: Record<string, { clip_seconds?: { set?: number[] } }> }).prices;

interface Audited {
  key: string;
  declared: number[];
  receipted: number[];
}

function auditedEndpoints(): Audited[] {
  const audited: Audited[] = [];
  for (const [provider, nodes, idKey] of SOURCES) {
    const seen = new Set<string>();
    for (const node of nodes) {
      if (node.outputType !== "video") continue;
      const id = node[idKey];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const declared = declaredDurations(node);
      if (declared.length === 0) continue;
      const receipted = prices[`${provider}:${id}`]?.clip_seconds?.set;
      if (!Array.isArray(receipted) || receipted.length === 0) continue;
      audited.push({ key: `${provider}:${id}`, declared, receipted });
    }
  }
  return audited;
}

/**
 * The audit's floor, not its target. It was 20 when written — every video
 * endpoint carrying both a duration enum and a receipted clip-length set.
 * A drop below this means the pairing stopped being found, which is the
 * failure this audit exists to catch; a rise is fine and needs no edit.
 */
const MIN_AUDITED_ENDPOINTS = 20;

describe("declared durations against receipted clip lengths", () => {
  const audited = auditedEndpoints();

  it("finds the endpoints it is meant to check", () => {
    expect(audited.length).toBeGreaterThanOrEqual(MIN_AUDITED_ENDPOINTS);
    // Both halves of the pairing must really be present, or the subset
    // assertion below is vacuous.
    expect(audited.every((a) => a.declared.length > 0)).toBe(true);
    expect(audited.every((a) => a.receipted.length > 0)).toBe(true);
    // All three manifests must be represented — a single provider passing is
    // not evidence the other two are still wired in.
    const providers = new Set(audited.map((a) => a.key.split(":")[0]));
    expect([...providers].sort()).toEqual(["atlascloud", "fal_ai", "kie"]);
  });

  it("offers no duration the provider publishes no price for", () => {
    const unpublished = audited
      .map(({ key, declared, receipted }) => ({
        key,
        extra: declared.filter((d) => !receipted.includes(d)),
        receipted
      }))
      .filter(({ extra }) => extra.length > 0);
    expect(unpublished).toEqual([]);
  });
});
