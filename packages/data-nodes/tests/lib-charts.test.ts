import { describe, expect, it } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ChartRendererLibNode } from "@nodetool-ai/data-nodes";

const data = {
  type: "dataframe" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  columns: null,
  rows: [
    { x: "a", y: 1 },
    { x: "b", y: 4 }
  ]
};

async function renderWith(props: Record<string, unknown>): Promise<string> {
  const node = new ChartRendererLibNode();
  node.assign({ data, ...props });
  const { output } = await node.process();
  return String((output as { data?: unknown }).data ?? "");
}

describe("ChartRenderer declares only options it renders", () => {
  it("has no despine prop", () => {
    const names = getNodeMetadata(ChartRendererLibNode).properties.map(
      (p) => p.name
    );
    expect(names).not.toContain("despine");
  });

  it("trim_margins changes the rendered pixels", async () => {
    const tight = await renderWith({ trim_margins: true });
    const padded = await renderWith({ trim_margins: false });
    expect(tight.length).toBeGreaterThan(100);
    expect(padded).not.toBe(tight);
  }, 30000);
});
