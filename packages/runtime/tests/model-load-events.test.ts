import { afterEach, describe, expect, it } from "vitest";
import {
  activeModelLoads,
  publishModelLoad,
  resetModelLoadsForTesting,
  subscribeModelLoads,
  type ModelLoadUpdate
} from "../src/model-load-events.js";

const update = (phase: ModelLoadUpdate["phase"]): ModelLoadUpdate => ({
  repo_id: "org/model",
  runtime: "transformers-js",
  phase,
  loaded_bytes: 0,
  total_bytes: 0
});

afterEach(() => {
  resetModelLoadsForTesting();
});

describe("model load events", () => {
  it("keeps a load until it ends", () => {
    publishModelLoad(update("downloading"));
    expect(activeModelLoads()).toEqual([update("downloading")]);
    publishModelLoad(update("ready"));
    expect(activeModelLoads()).toEqual([]);
  });

  it("delivers to every subscriber when one throws", () => {
    const seen: string[] = [];
    subscribeModelLoads(() => {
      throw new Error("closed socket");
    });
    subscribeModelLoads((u) => seen.push(u.phase));
    publishModelLoad(update("loading"));
    expect(seen).toEqual(["loading"]);
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeModelLoads((u) => seen.push(u.phase));
    unsubscribe();
    publishModelLoad(update("loading"));
    expect(seen).toEqual([]);
  });
});
