/** F44: the browser pattern library fetches user pattern assets in parallel. */

import { useAssetStore } from "../../../stores/AssetStore";
import { createBrowserStepPatternLibrary } from "../useTimelineAgentBridge";

it("fetches every pattern asset at once and keeps the asset order (F44)", async () => {
  const assets = ["a", "b", "c"].map((id) => ({ id, name: id, get_url: `https://x/${id}`, metadata: {} }));
  jest.spyOn(useAssetStore, "getState").mockReturnValue({
    ...useAssetStore.getState(),
    load: (async () => ({ assets })) as never
  });
  let inFlight = 0;
  let peak = 0;
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    const id = String(url).split("/").pop();
    return { ok: true, json: async () => ({ name: id, pattern: { lengthSteps: 16, rows: [] } }) } as Response;
  }) as typeof fetch;
  try {
    const list = await createBrowserStepPatternLibrary().list();
    expect(list.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(peak).toBe(3);
  } finally {
    globalThis.fetch = original;
  }
});
