import { stub } from "../../../test-utils/doubles";
import { queryClient } from "../../../queryClient";
import { restFetch } from "../../rest-fetch";
import { loadRuntimePresetCatalog } from "../loadRuntimeCatalog";
import { presetCatalog, setPresetCatalog } from "../catalog";
import presetData from "@nodetool-ai/presets/preset-catalog.json";
import { makePreset } from "../../../test-utils/presetFixtures";

jest.mock("../../rest-fetch", () => ({ restFetch: jest.fn() }));
const fetchCatalog = jest.mocked(restFetch);
afterEach(() => {
  queryClient.clear();
  setPresetCatalog(presetData);
  jest.resetAllMocks();
});

it("loads a server pack into the catalogue used by existing web consumers", async () => {
  const preset = makePreset("camera.server-pack", { author: "Pack author" });
  fetchCatalog.mockResolvedValue(stub<Response>({ ok: true, json: async () => [...presetData, preset] }));
  await loadRuntimePresetCatalog();
  expect(presetCatalog.getPreset(preset.id)?.author).toBe("Pack author");
});

it("reports load failures instead of silently discarding installed pack selections", async () => {
  fetchCatalog.mockResolvedValue(stub<Response>({ ok: false, status: 503 }));
  await expect(loadRuntimePresetCatalog()).rejects.toThrow("Failed to load preset catalogue");
});
