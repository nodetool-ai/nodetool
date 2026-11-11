import { describe, expect, it } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type { ScriptedEndpointReply } from "@nodetool-ai/runtime";
import { CreateImageNode } from "../src/nodes/create-image.js";
import { EditImageNode } from "../src/nodes/edit-image.js";
import { RemixImageNode } from "../src/nodes/remix-image.js";

const FAKE_IMAGE_B64 = Buffer.from("fake-png-bytes").toString("base64");

const OK_REPLY: ScriptedEndpointReply = {
  output: {
    image: FAKE_IMAGE_B64,
    version: "reve-create@20250915",
    request_id: "req_test",
    credits_used: 1,
    credits_remaining: 99
  },
  requestId: "req_test"
};

function setup(reply: ScriptedEndpointReply = OK_REPLY): {
  provider: ScriptedProvider;
  context: ProcessingContext;
} {
  const provider = new ScriptedProvider([], {
    providerId: "reve",
    endpoints: { "*": reply }
  });
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => provider);
  return { provider, context };
}

describe("Reve nodes", () => {
  describe("CreateImageNode", () => {
    it("calls reve-create and returns an ImageRef", async () => {
      const { provider, context } = setup();
      const node = new CreateImageNode({
        prompt: "a red panda",
        aspect_ratio: "16:9"
      });
      const result = await node.process(context);

      expect(provider.endpointCalls).toHaveLength(1);
      const call = provider.endpointCalls[0];
      expect(call.model).toBe("reve-create");
      expect(call.route).toBeUndefined();
      expect(call.input).toEqual({
        prompt: "a red panda",
        aspect_ratio: "16:9",
        version: "latest",
        test_time_scaling: 1
      });
      expect(result.output).toMatchObject({
        type: "image",
        data: FAKE_IMAGE_B64,
        mimeType: "image/png"
      });
    });

    it("emits a prediction for the reve provider, capability and model", async () => {
      const { context } = setup();
      const node = new CreateImageNode({ prompt: "x" });
      node.__node_id = "node-7";
      await node.process(context);
      const predictions = context
        .getMessages()
        .filter((m) => m.type === "prediction");
      expect(predictions.at(-1)).toMatchObject({
        status: "completed",
        provider: "reve",
        capability: "text_to_image",
        model: "reve-create",
        node_id: "node-7"
      });
    });

    it("includes postprocessing when selected", async () => {
      const { provider, context } = setup();
      await new CreateImageNode({
        prompt: "x",
        postprocessing: "upscale"
      }).process(context);
      expect(provider.endpointCalls[0].input.postprocessing).toEqual([
        "upscale"
      ]);
    });

    it("never reads an API key from the node", async () => {
      const { provider, context } = setup();
      const node = new CreateImageNode({ prompt: "x" });
      node.setDynamic("_secrets", { REVE_API_KEY: "from-secrets" });
      await node.process(context);
      expect(JSON.stringify(provider.endpointCalls[0].input)).not.toContain(
        "from-secrets"
      );
    });

    it("throws when the prompt is empty", async () => {
      const node = new CreateImageNode({ prompt: "" });
      await expect(node.process()).rejects.toThrow("Prompt is required");
    });

    it("needs a processing context to reach the provider", async () => {
      await expect(new CreateImageNode({ prompt: "x" }).process()).rejects.toThrow(
        "requires a processing context"
      );
    });

    it("throws when Reve returns no image", async () => {
      const { context } = setup({ output: { request_id: "r" } });
      await expect(
        new CreateImageNode({ prompt: "x" }).process(context)
      ).rejects.toThrow("Reve returned no image");
    });

    it("surfaces a provider error", async () => {
      const { context } = setup(new Error("Reve API error (402): no credits"));
      await expect(
        new CreateImageNode({ prompt: "x" }).process(context)
      ).rejects.toThrow("Reve API error (402)");
    });
  });

  describe("EditImageNode", () => {
    it("sends the reference image as base64 and the instruction", async () => {
      const { provider, context } = setup();
      const node = new EditImageNode({
        edit_instruction: "make it night",
        image: { type: "image", data: FAKE_IMAGE_B64 }
      });
      const result = await node.process(context);

      const call = provider.endpointCalls[0];
      expect(call.model).toBe("reve-edit");
      expect(call.input.edit_instruction).toBe("make it night");
      expect(call.input.reference_image).toBe(FAKE_IMAGE_B64);
      // "none" aspect ratio is omitted so the reference ratio is kept.
      expect(call.input.aspect_ratio).toBeUndefined();
      expect(result.output).toMatchObject({ type: "image" });
      const prediction = context
        .getMessages()
        .filter((m) => m.type === "prediction")
        .at(-1);
      expect(prediction).toMatchObject({ capability: "image_to_image" });
    });

    it("forwards a chosen aspect ratio", async () => {
      const { provider, context } = setup();
      await new EditImageNode({
        edit_instruction: "x",
        image: { type: "image", data: FAKE_IMAGE_B64 },
        aspect_ratio: "1:1"
      }).process(context);
      expect(provider.endpointCalls[0].input.aspect_ratio).toBe("1:1");
    });

    it("throws when the instruction is empty", async () => {
      const node = new EditImageNode({
        edit_instruction: "",
        image: { type: "image", data: FAKE_IMAGE_B64 }
      });
      await expect(node.process()).rejects.toThrow(
        "Edit instruction is required"
      );
    });
  });

  describe("RemixImageNode", () => {
    it("sends multiple reference images as base64", async () => {
      const { provider, context } = setup();
      await new RemixImageNode({
        prompt: "blend <img>0</img> and <img>1</img>",
        reference_images: [
          { type: "image", data: FAKE_IMAGE_B64 },
          { type: "image", data: FAKE_IMAGE_B64 }
        ]
      }).process(context);

      const call = provider.endpointCalls[0];
      expect(call.model).toBe("reve-remix");
      expect(call.input.prompt).toBe("blend <img>0</img> and <img>1</img>");
      expect(call.input.reference_images).toEqual([
        FAKE_IMAGE_B64,
        FAKE_IMAGE_B64
      ]);
    });

    it("throws without reference images", async () => {
      const node = new RemixImageNode({ prompt: "x", reference_images: [] });
      await expect(node.process()).rejects.toThrow(
        "At least one reference image is required"
      );
    });

    it("throws with more than 6 reference images", async () => {
      const refs = Array.from({ length: 7 }, () => ({
        type: "image",
        data: FAKE_IMAGE_B64
      }));
      const node = new RemixImageNode({ prompt: "x", reference_images: refs });
      await expect(node.process()).rejects.toThrow(
        "at most 6 reference images"
      );
    });
  });
});
