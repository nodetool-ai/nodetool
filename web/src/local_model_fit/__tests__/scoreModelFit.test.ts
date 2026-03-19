import {
  scoreModelFit,
  effectiveMemoryGb,
  scoreToTier,
  tierToLabel,
} from "../scoreModelFit";
import type { HardwareProfile, ModelCatalogEntry, ModelVariant } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const rtx4090: HardwareProfile = {
  id: "rtx-4090",
  label: "RTX 4090",
  vramGb: 24,
  ramGb: 32,
  platform: "windows",
  detected: false,
};

const macM1_8gb: HardwareProfile = {
  id: "m1-8gb",
  label: "Apple M1 8 GB",
  vramGb: 0,
  ramGb: 8,
  platform: "macos",
  detected: false,
};

const cpuOnly8: HardwareProfile = {
  id: "cpu-8gb",
  label: "CPU 8 GB",
  vramGb: 0,
  ramGb: 8,
  platform: "unknown",
  detected: false,
};

const smallModel: ModelCatalogEntry = {
  id: "test-1b",
  name: "Test 1B",
  family: "Test",
  provider: "ollama",
  paramLabel: "1B",
  tags: ["chat"],
  paramsBillion: 1,
  activeParamsBillion: 1,
  contextLength: 8192,
  variants: [
    { id: "q4", label: "Q4 (4-bit)", memoryGb: 0.8, bits: 4 },
    { id: "q8", label: "Q8 (8-bit)", memoryGb: 1.3, bits: 8 },
  ],
};

const bigModel: ModelCatalogEntry = {
  id: "test-70b",
  name: "Test 70B",
  family: "Test",
  provider: "ollama",
  paramLabel: "70B",
  tags: ["chat", "code", "reasoning"],
  paramsBillion: 70,
  activeParamsBillion: 70,
  contextLength: 131072,
  variants: [
    { id: "q4", label: "Q4 (4-bit)", memoryGb: 40, bits: 4 },
    { id: "q8", label: "Q8 (8-bit)", memoryGb: 75, bits: 8 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("effectiveMemoryGb", () => {
  it("returns VRAM for discrete GPU", () => {
    expect(effectiveMemoryGb(rtx4090)).toBe(24);
  });

  it("returns 75% RAM for macOS (Apple Silicon)", () => {
    expect(effectiveMemoryGb(macM1_8gb)).toBe(6);
  });

  it("returns 60% RAM for CPU-only", () => {
    expect(effectiveMemoryGb(cpuOnly8)).toBeCloseTo(4.8);
  });
});

describe("scoreToTier", () => {
  it("maps 100 → S", () => expect(scoreToTier(100)).toBe("S"));
  it("maps 90 → S", () => expect(scoreToTier(90)).toBe("S"));
  it("maps 89 → A", () => expect(scoreToTier(89)).toBe("A"));
  it("maps 75 → A", () => expect(scoreToTier(75)).toBe("A"));
  it("maps 60 → B", () => expect(scoreToTier(60)).toBe("B"));
  it("maps 40 → C", () => expect(scoreToTier(40)).toBe("C"));
  it("maps 20 → D", () => expect(scoreToTier(20)).toBe("D"));
  it("maps 0 → F", () => expect(scoreToTier(0)).toBe("F"));
});

describe("tierToLabel", () => {
  it("S → Excellent", () => expect(tierToLabel("S")).toBe("Excellent"));
  it("F → Won't Fit", () => expect(tierToLabel("F")).toBe("Won't Fit"));
});

describe("scoreModelFit", () => {
  it("scores a small model on a big GPU as Excellent / tier S", () => {
    const result = scoreModelFit(rtx4090, smallModel, smallModel.variants[0]);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.tier).toBe("S");
    expect(result.fitLabel).toBe("Excellent");
    expect(result.fits).toBe(true);
  });

  it("scores a 70B q8 model that exceeds 24 GB VRAM as not fitting", () => {
    const result = scoreModelFit(rtx4090, bigModel, bigModel.variants[1]); // 75 GB
    expect(result.fits).toBe(false);
    expect(result.tier).toBe("F");
  });

  it("populates all canonical fields", () => {
    const result = scoreModelFit(rtx4090, smallModel, smallModel.variants[0]);
    expect(result.id).toBe("test-1b::q4");
    expect(result.modelId).toBe("test-1b");
    expect(result.variantId).toBe("q4");
    expect(result.name).toBe("Test 1B");
    expect(result.provider).toBe("ollama");
    expect(result.family).toBe("Test");
    expect(result.tags).toEqual(["chat"]);
    expect(result.memoryGb).toBe(0.8);
    expect(typeof result.memoryPercent).toBe("number");
    expect(result.contextLength).toBe(8192);
    expect(Array.isArray(result.reasons)).toBe(true);
  });

  it("gives a 4-bit variant a higher score than 8-bit for the same model", () => {
    const q4 = scoreModelFit(rtx4090, smallModel, smallModel.variants[0]);
    const q8 = scoreModelFit(rtx4090, smallModel, smallModel.variants[1]);
    expect(q4.score).toBeGreaterThanOrEqual(q8.score);
  });

  it("handles Apple Silicon correctly (uses 75% of RAM)", () => {
    const result = scoreModelFit(macM1_8gb, smallModel, smallModel.variants[0]); // 0.8 / 6 ≈ 13%
    expect(result.fits).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("handles a model just barely fitting (tight ratio)", () => {
    const tightHw: HardwareProfile = {
      id: "tight", label: "Tight", vramGb: 5, ramGb: 16, platform: "windows", detected: false,
    };
    const variant: ModelVariant = { id: "q4", label: "Q4", memoryGb: 4.5, bits: 4 };
    const result = scoreModelFit(tightHw, smallModel, variant);
    expect(result.fits).toBe(true);
    expect(result.score).toBeLessThan(65);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });
});
