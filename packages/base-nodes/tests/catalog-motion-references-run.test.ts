/**
 * Runs "Animate a Product Catalog with References" headlessly and checks what
 * Reference To Video sends to the provider: the reference images in order and
 * the prompt with each role placeholder turned into "image N".
 *
 * A fake provider records the call. The catalog and the images are data URIs,
 * so nothing touches the network or a real model.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { FakeProvider, createFakeContext } from "@nodetool-ai/runtime";
import type {
  ReferenceToVideoInputs,
  ReferenceToVideoParams
} from "@nodetool-ai/runtime";
import { Graph, WorkflowRunner } from "@nodetool-ai/kernel";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base/Animate a Product Catalog with References.json"
);
const PROVIDER = "catalog-capture";

const calls: { images: string[]; prompt: string }[] = [];

class CaptureProvider extends FakeProvider {
  constructor() {
    super();
    (this as unknown as { provider: string }).provider = PROVIDER;
  }
  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    calls.push({
      images: inputs.images.map((bytes) => Buffer.from(bytes).toString("utf8")),
      prompt: String(params.prompt ?? "")
    });
    return super.referenceToVideo(inputs, params);
  }
}


const dataUri = (mime: string, text: string): string =>
  `data:${mime};base64,${Buffer.from(text, "utf8").toString("base64")}`;
const image = (label: string) => ({ type: "image", uri: dataUri("image/png", label) });
const NO_IMAGE = { type: "image", uri: "", asset_id: null, data: null };

// Tab-separated: the image's data URI holds a comma and a semicolon.
const CATALOG = {
  type: "document",
  uri: dataUri(
    "text/csv",
    `title\tcolor\timage_url\nTumbler\tolive\t${dataUri("image/png", "product")}\n`
  )
};
const TEMPLATE =
  "The product from {{product_image}}: {{title}} in {{color}}. Scene from {{background_image}}, props from {{decoration_image}}.";

async function run(params: Record<string, unknown>) {
  calls.length = 0;
  const { graph } = JSON.parse(fs.readFileSync(WORKFLOW, "utf8")) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const fake = createFakeContext({
    jobId: "catalog-references",
    providers: { [PROVIDER]: new CaptureProvider() }
  });
  const loaded = await Graph.loadFromDict(graph as never, {
    resolver: createGraphNodeTypeResolver(registry)
  } as never);
  const runner = new WorkflowRunner("catalog-references", {
    resolveExecutor: (node) => registry.resolve(node),
    executionContext: fake.context
  } as never);
  const result = await runner
    .run(
      {
        job_id: "catalog-references",
        params: {
          catalog: CATALOG,
          prompt_template: TEMPLATE,
          video_model: { type: "video_model", provider: PROVIDER, id: "fake-video", name: "Fake Video" },
          ...params
        }
      } as never,
      { nodes: [...loaded.nodes], edges: [...loaded.edges] } as never
    )
    .finally(() => fake.cleanup());
  expect(result.error ?? null).toBeNull();
  expect(result.status).toBe("completed");
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe("Animate a Product Catalog with References", () => {
  it("numbers product, background and decoration as image 1, 2 and 3", async () => {
    const call = await run({
      background_image: image("background"),
      decoration_image: image("decoration")
    });
    expect(call.images).toEqual(["product", "background", "decoration"]);
    expect(call.prompt).toBe(
      "The product from image 1: Tumbler in olive. Scene from image 2, props from image 3."
    );
  });

  it("makes the decoration image 2 when there is no background", async () => {
    const call = await run({
      background_image: NO_IMAGE,
      decoration_image: image("decoration")
    });
    expect(call.images).toEqual(["product", "decoration"]);
    expect(call.prompt).toBe(
      "The product from image 1: Tumbler in olive. Scene from, props from image 2."
    );
  });
});
