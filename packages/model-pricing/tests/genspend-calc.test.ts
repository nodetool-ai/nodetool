/**
 * The parameter-aware calculator. Its arithmetic is the port of `priceCase` in
 * `scripts/genspend/parity-check.mjs`, which the nightly sync asserts against
 * GenSpend's own `/quote`; these tests pin the rules against fixtures so they
 * do not churn when the nightly catalog moves a price.
 */
import { describe, expect, it } from "vitest";
import type { GenspendPrice } from "../src/genspend-catalog.js";
import { normalizeResolution, priceGenspendEntry } from "../src/genspend-calc.js";

/** A laddered per-second video model with a re-rate scoped to 720p. */
const LADDER: GenspendPrice = {
  unit_price: 0.205,
  billing_unit: "seconds",
  unit_class: "per-video-second",
  model_slug: "ladder-2",
  match: "provider-id",
  live: true,
  source_url: "https://example.test/ladder",
  variants: [
    {
      price_usd: 1.04,
      unit_class: "per-video-second",
      resolution: "4K",
      video_input: false,
      is_base: false
    },
    {
      price_usd: 0.51,
      unit_class: "per-video-second",
      resolution: "1080p",
      video_input: false,
      is_base: false
    },
    {
      price_usd: 0.205,
      unit_class: "per-video-second",
      resolution: "720p",
      video_input: false,
      is_base: true
    },
    {
      price_usd: 0.095,
      unit_class: "per-video-second",
      resolution: "480p",
      video_input: false,
      is_base: false
    }
  ],
  surcharges: [
    {
      kind: "input_video_second",
      spec: "720p",
      unit_price_usd: 0.125,
      free_allowance: 0
    }
  ],
  clip_seconds: { min: 4, max: 15 }
};

/** A flat per-image model with an additive reference-image surcharge. */
const IMAGE_WITH_REFS: GenspendPrice = {
  unit_price: 0.04,
  billing_unit: "images",
  unit_class: "per-image",
  model_slug: "refs-1",
  match: "catalog",
  live: false,
  source_url: "https://example.test/refs",
  surcharges: [
    { kind: "input_image", unit_price_usd: 0.01, free_allowance: 4 },
    {
      kind: "per_request",
      unit_price_usd: 0.03,
      free_allowance: 0,
      label: "prompt expansion"
    }
  ]
};

describe("priceGenspendEntry", () => {
  it("narrows the ladder to the stated resolution and multiplies by seconds", () => {
    const price = priceGenspendEntry(LADDER, { resolution: "1080p", seconds: 5 });
    expect(price.declined).toBeUndefined();
    expect(price.unit_price).toBeCloseTo(2.55, 10);
    expect(price.breakdown).toContain("5 s");
    expect(price.breakdown).toContain("1080p");
  });

  it("prices the cheaper rung when the node states it", () => {
    expect(
      priceGenspendEntry(LADDER, { resolution: "480p", seconds: 5 }).unit_price
    ).toBeCloseTo(0.475, 10);
  });

  it("declines a stated resolution the provider does not publish", () => {
    const price = priceGenspendEntry(LADDER, { resolution: "2K", seconds: 5 });
    expect(price.declined).toBe("no published price at 2K");
    expect(price.unit_price).toBe(0);
  });

  it("prices the base-spec rung with an assumption when resolution is unset", () => {
    const price = priceGenspendEntry(LADDER, { seconds: 5 });
    expect(price.unit_price).toBeCloseTo(1.025, 10);
    expect(price.assumptions?.join(" ")).toContain("720p");
  });

  it("reads 768p as the 720p tier rather than declining it", () => {
    expect(normalizeResolution("768p")).toBe("720p");
    expect(
      priceGenspendEntry(LADDER, { resolution: "768p", seconds: 5 }).unit_price
    ).toBeCloseTo(1.025, 10);
  });

  it("treats an unrecognized resolution as unset — an assumption, not a guess", () => {
    const price = priceGenspendEntry(LADDER, { resolution: "cinematic", seconds: 5 });
    expect(price.declined).toBeUndefined();
    expect(price.unit_price).toBeCloseTo(1.025, 10);
    expect(price.assumptions?.join(" ")).toContain("cinematic");
  });

  it("declines a duration outside the receipted clip envelope", () => {
    expect(priceGenspendEntry(LADDER, { seconds: 30 }).declined).toContain(
      "above the receipted clip envelope"
    );
    expect(priceGenspendEntry(LADDER, { seconds: 2 }).declined).toContain(
      "below the receipted clip envelope"
    );
  });

  it("declines every duration when the model publishes no clip length", () => {
    const noClip: GenspendPrice = { ...LADDER, clip_seconds: null };
    expect(priceGenspendEntry(noClip, { seconds: 5 }).declined).toBe(
      "no receipted clip length for this model"
    );
    expect(priceGenspendEntry(noClip, {}).declined).toBe(
      "no receipted clip length for this model"
    );
  });

  it("prices the shortest receipted clip with an assumption when duration is unset", () => {
    const price = priceGenspendEntry(LADDER, { resolution: "720p" });
    expect(price.unit_price).toBeCloseTo(0.82, 10); // 4 s minimum × $0.205
    expect(price.assumptions?.join(" ")).toContain("duration not set");
  });

  it("prices one second when the model publishes no envelope at all", () => {
    const { clip_seconds: _clip, ...unbounded } = LADDER;
    const price = priceGenspendEntry(unbounded as GenspendPrice, {
      resolution: "720p"
    });
    expect(price.unit_price).toBeCloseTo(0.205, 10);
    expect(price.assumptions?.join(" ")).toContain("duration not set");
  });

  it("takes the audio rung when the node asks for audio", () => {
    const audio: GenspendPrice = {
      ...LADDER,
      variants: [
        {
          price_usd: 0.1,
          unit_class: "per-video-second",
          resolution: "1080p",
          with_audio: false,
          is_base: true
        },
        {
          price_usd: 0.2,
          unit_class: "per-video-second",
          resolution: "1080p",
          with_audio: true,
          is_base: false
        }
      ],
      surcharges: []
    };
    expect(
      priceGenspendEntry(audio, { resolution: "1080p", seconds: 5 }).unit_price
    ).toBeCloseTo(0.5, 10);
    expect(
      priceGenspendEntry(audio, { resolution: "1080p", seconds: 5, withAudio: true })
        .unit_price
    ).toBeCloseTo(1.0, 10);
  });

  it("prices a per-generation duration rung without multiplying by seconds", () => {
    const perGeneration: GenspendPrice = {
      ...LADDER,
      variants: [
        {
          price_usd: 0.28,
          unit_class: "per-generation",
          resolution: "720p",
          duration_seconds: 6,
          is_base: true
        },
        {
          price_usd: 0.56,
          unit_class: "per-generation",
          resolution: "720p",
          duration_seconds: 10,
          is_base: false
        }
      ],
      surcharges: [],
      clip_seconds: { set: [6, 10] }
    };
    expect(
      priceGenspendEntry(perGeneration, { resolution: "720p", seconds: 10 }).unit_price
    ).toBeCloseTo(0.56, 10);
    expect(
      priceGenspendEntry(perGeneration, { resolution: "720p", seconds: 7 }).declined
    ).toBe("no published price at 7s");
  });

  it("adds reference images only past the free allowance", () => {
    expect(
      priceGenspendEntry(IMAGE_WITH_REFS, { referenceImages: 3 }).unit_price
    ).toBeCloseTo(0.04, 10);
    const past = priceGenspendEntry(IMAGE_WITH_REFS, { referenceImages: 8 });
    expect(past.unit_price).toBeCloseTo(0.08, 10);
    expect(past.breakdown).toContain("4 ref images");
  });

  it("warns instead of guessing when reference images are unpriced", () => {
    const price = priceGenspendEntry(LADDER, {
      resolution: "720p",
      seconds: 5,
      referenceImages: 2
    });
    expect(price.unit_price).toBeCloseTo(1.025, 10);
    expect(price.warnings?.join(" ")).toContain("lower bound");
  });

  it("re-rates the whole job on a scoped reference-video rate", () => {
    const price = priceGenspendEntry(LADDER, {
      resolution: "720p",
      seconds: 5,
      referenceVideoSeconds: 5
    });
    // Replaces the generation cost: $0.125 × (5 out + 5 in), not added to it.
    expect(price.unit_price).toBeCloseTo(1.25, 10);
  });

  it("declines the re-rate, not the step, when no rate is scoped to the resolution", () => {
    const price = priceGenspendEntry(LADDER, {
      resolution: "480p",
      seconds: 5,
      referenceVideoSeconds: 5
    });
    expect(price.unit_price).toBeCloseTo(0.475, 10);
    expect(price.warnings?.join(" ")).toContain("no video-input rate");
  });

  it("surfaces per_request extras without summing them", () => {
    const price = priceGenspendEntry(IMAGE_WITH_REFS, {});
    expect(price.unit_price).toBeCloseTo(0.04, 10);
    expect(price.warnings?.join(" ")).toContain("prompt expansion");
  });

  it("declines an entry with an open quote discrepancy", () => {
    const flagged: GenspendPrice = {
      ...IMAGE_WITH_REFS,
      data_flags: [{ kind: "quote_mismatch", severity: "quote_wrong" }]
    };
    expect(priceGenspendEntry(flagged, {}).declined).toContain("discrepancy");
  });

  it("prices a spec_gap entry at its base spec and warns off it", () => {
    const gapped: GenspendPrice = {
      ...IMAGE_WITH_REFS,
      surcharges: [],
      data_flags: [{ kind: "missing_ladder", severity: "spec_gap" }]
    };
    const price = priceGenspendEntry(gapped, {});
    expect(price.unit_price).toBeCloseTo(0.04, 10);
    expect(price.warnings?.join(" ")).toContain("base spec");
  });

  it("prices a flat entry with no grid exactly as the scalar did", () => {
    const flat: GenspendPrice = { ...IMAGE_WITH_REFS, surcharges: [] };
    expect(priceGenspendEntry(flat, {}).unit_price).toBe(flat.unit_price);
  });
});
