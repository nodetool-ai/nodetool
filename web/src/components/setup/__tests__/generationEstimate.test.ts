/**
 * The setup flow's price estimate reads the same provider tables as the
 * server-side CostCalculator (`@nodetool-ai/protocol`), so what a step tells a
 * creator before the run and what the run is charged cannot disagree about
 * which provider a model belongs to, or which providers are free.
 */

import {
  GENAI_PROVIDER_MAP,
  LOCAL_FREE_PROVIDERS
} from "@nodetool-ai/protocol";

import { generationEstimate } from "../generationEstimate";

const BRIEF = "A ten-second teaser for a desert trip.";

describe("generationEstimate", () => {
  it("prices every locally-run provider at nothing", () => {
    for (const provider of LOCAL_FREE_PROVIDERS) {
      expect(
        generationEstimate({ id: "llama-3.1-8b", provider }, BRIEF, 4000)
      ).toEqual({ low: 0, high: 0, inputTokens: expect.any(Number) });
    }
  });

  // The alias is what makes this work: the catalog knows "google", the model
  // arrives from a provider NodeTool calls "gemini". Reading the id straight
  // through returns no price at all.
  it("prices a model through its aliased provider id", () => {
    expect(GENAI_PROVIDER_MAP.gemini).toBe("google");

    const estimate = generationEstimate(
      { id: "gemini-2.5-flash", provider: "gemini" },
      BRIEF,
      4000
    );

    expect(estimate).not.toBeNull();
    expect(estimate!.low).toBeGreaterThan(0);
    expect(estimate!.high).toBeGreaterThanOrEqual(estimate!.low);
  });

  it("gives no estimate without a model, and none the catalog cannot price", () => {
    expect(generationEstimate(null, BRIEF, 4000)).toBeNull();
    expect(
      generationEstimate(
        { id: "totally-not-a-real-model-xyz", provider: "openai" },
        BRIEF,
        4000
      )
    ).toBeNull();
  });
});
