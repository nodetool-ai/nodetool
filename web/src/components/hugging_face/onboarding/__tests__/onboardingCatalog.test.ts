import {
  ONBOARDING_MODELS,
  ONBOARDING_ENGINES,
  ONBOARDING_NODE_PACKS,
  classifyFit,
  sortModelsByFit,
  getEngine,
  type OnboardingModel
} from "../onboardingCatalog";

describe("onboardingCatalog data", () => {
  it("references a known engine on every model", () => {
    for (const model of ONBOARDING_MODELS) {
      expect(getEngine(model.engine)).toBeDefined();
    }
  });

  it("keeps sizes and memory positive and mostly in the 2-30 GB range", () => {
    for (const model of ONBOARDING_MODELS) {
      expect(model.approxSizeGb).toBeGreaterThan(0);
      expect(model.minVramGb).toBeGreaterThan(0);
      expect(model.approxSizeGb).toBeLessThanOrEqual(30);
    }
  });

  it("carries a real download descriptor with a type", () => {
    for (const model of ONBOARDING_MODELS) {
      expect(model.model.type).toBeTruthy();
      expect(model.model.id).toBeTruthy();
    }
  });

  it("uses unique catalog ids", () => {
    const ids = ONBOARDING_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has node packs with owner/repo ids", () => {
    for (const pack of ONBOARDING_NODE_PACKS) {
      expect(pack.repoId).toMatch(/^[^/]+\/[^/]+$/);
    }
  });

  it("marks exactly one bundled engine (Ollama)", () => {
    const bundled = ONBOARDING_ENGINES.filter((e) => e.bundled);
    expect(bundled).toHaveLength(1);
    expect(bundled[0].id).toBe("ollama");
  });
});

describe("classifyFit", () => {
  it("returns unknown when the budget is null", () => {
    expect(classifyFit(8, null)).toBe("unknown");
  });

  it("returns fits with comfortable headroom", () => {
    expect(classifyFit(8, 12)).toBe("fits");
  });

  it("returns tight when at the limit without headroom", () => {
    expect(classifyFit(8, 8)).toBe("tight");
    expect(classifyFit(8, 8.5)).toBe("tight");
  });

  it("returns over when the budget is below the requirement", () => {
    expect(classifyFit(16, 8)).toBe("over");
  });
});

describe("sortModelsByFit", () => {
  const make = (id: string, minVramGb: number): OnboardingModel => ({
    id,
    name: id,
    capability: "chat",
    engine: "ollama",
    blurb: "",
    approxSizeGb: minVramGb,
    minVramGb,
    model: { id, name: id, type: "llama_model" }
  });

  it("orders fitting models before ones that need more memory", () => {
    const models = [make("big", 24), make("small", 4), make("mid", 8)];
    const sorted = sortModelsByFit(models, 8);
    // 8 GB budget: mid (tight/fits) and small fit; big is over and goes last.
    expect(sorted[sorted.length - 1].id).toBe("big");
  });

  it("puts the largest fitting model first", () => {
    const models = [make("small", 4), make("mid", 8), make("tiny", 2)];
    const sorted = sortModelsByFit(models, 24);
    expect(sorted[0].id).toBe("mid");
  });

  it("does not mutate the input array", () => {
    const models = [make("a", 4), make("b", 8)];
    const copy = [...models];
    sortModelsByFit(models, 8);
    expect(models).toEqual(copy);
  });
});
