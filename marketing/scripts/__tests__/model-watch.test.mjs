// Run: node --test marketing/scripts/__tests__/model-watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCoverageSlugs,
  matchesSlug,
  loadWatchlist,
  classifyProvider,
  deriveSeedSlug,
} from "../model-watch.mjs";

test("parseCoverageSlugs pulls the object keys, not the provider ids", () => {
  const src = `export const modelProviderCoverage: Record<string, string[]> = {
  "flux": ["fal_ai","replicate"],
  "veo-3": ["fal_ai"],
};`;
  assert.deepEqual(parseCoverageSlugs(src), ["flux", "veo-3"]);
});

test("matchesSlug is token-aware, not naive substring", () => {
  assert.ok(matchesSlug("fal-ai/flux/schnell", "flux"));
  assert.ok(!matchesSlug("some/influx-model", "flux"));
  // de-hyphenated variants
  assert.ok(matchesSlug("veo3-fast", "veo-3"));
  assert.ok(matchesSlug("google/veo-3", "veo-3"));
});

test("classifyProvider: covered, ignored, and new are split correctly", () => {
  const knownSlugs = ["flux", "imagen"];
  const watchlist = loadWatchlist({
    all: ["shared-junk"],
    providers: { fal_ai: ["fal-ai/recraft-v3"] },
  });
  const models = [
    { id: "fal-ai/flux/schnell", name: "FLUX Schnell" }, // covered
    { id: "fal-ai/imagen4", name: "Imagen 4" }, // covered
    { id: "fal-ai/recraft-v3", name: "Recraft V3" }, // ignored (provider)
    { id: "shared-junk", name: "Junk" }, // ignored (all)
    { id: "fal-ai/nano-banana", name: "Nano Banana" }, // NEW
  ];

  const r = classifyProvider("fal_ai", models, knownSlugs, watchlist);
  assert.equal(r.covered, 2);
  assert.equal(r.ignored, 2);
  assert.equal(r.newCount, 1);
  assert.equal(r.new[0].id, "fal-ai/nano-banana");
  assert.match(r.new[0].seedCommand, /--models nano-banana/);
  assert.match(r.new[0].seedCommand, /--provider fal_ai/);
});

test("watchlist suppression is case-insensitive", () => {
  const watchlist = loadWatchlist({ all: ["Fal-AI/Foo"], providers: {} });
  const r = classifyProvider(
    "fal_ai",
    [{ id: "fal-ai/foo", name: "Foo" }],
    [],
    watchlist
  );
  assert.equal(r.newCount, 0);
  assert.equal(r.ignored, 1);
});

test("deriveSeedSlug takes the last path segment", () => {
  assert.equal(deriveSeedSlug("fal-ai/flux/schnell"), "schnell");
  assert.equal(deriveSeedSlug("black-forest-labs/FLUX.1-dev"), "flux-1-dev");
});
