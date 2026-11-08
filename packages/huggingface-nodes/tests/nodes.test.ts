import { beforeEach, describe, expect, it } from "vitest";
import {
  ProcessingContext,
  ScriptedProvider,
  type ScriptedEndpointReply
} from "@nodetool-ai/runtime";
import {
  ChatCompletionNode,
  QuestionAnsweringNode,
  TextClassificationNode,
  ZeroShotClassificationNode
} from "../src/nodes/text.js";
import { TextToImageNode, ObjectDetectionNode } from "../src/nodes/image.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/audio.js";
import { TextToVideoNode } from "../src/nodes/video.js";

let provider: ScriptedProvider;
let ctx: ProcessingContext;

/** Answer every endpoint call with `reply`. */
function reply(response: ScriptedEndpointReply): void {
  provider.scriptEndpoint("*", response);
}

/** The n-th endpoint request the node made. */
function request(index = 0) {
  return provider.endpointCalls[index];
}

beforeEach(() => {
  provider = new ScriptedProvider([], { providerId: "huggingface" });
  ctx = new ProcessingContext({ jobId: "job-1" });
  ctx.setProviderResolver(async () => provider);
});

describe("generation record", () => {
  it("emits a prediction message with the provider, capability and model", async () => {
    reply({ output: { data: new Uint8Array([1, 2]), mimeType: "image/png" } });
    const node = new TextToImageNode({ prompt: "a cat", model: "img/model" });
    await node.process(ctx);

    const predictions = ctx
      .getMessages()
      .filter((message) => message.type === "prediction");
    expect(predictions.map((message) => message.status)).toEqual([
      "running",
      "completed"
    ]);
    expect(predictions.at(-1)).toMatchObject({
      provider: "huggingface",
      capability: "text_to_image",
      model: "img/model",
      // The image bytes stay out of the message.
      data: null
    });
  });
});

describe("TextClassificationNode", () => {
  it("returns the top label and full scores", async () => {
    reply({
      output: [
        { label: "POSITIVE", score: 0.98 },
        { label: "NEGATIVE", score: 0.02 }
      ]
    });
    const node = new TextClassificationNode({ inputs: "I love this" });
    const out = await node.process(ctx);
    expect(out.output).toBe("POSITIVE");
    expect((out.scores as unknown[]).length).toBe(2);

    expect(request()).toMatchObject({
      route: "text-classification",
      input: { inputs: "I love this" }
    });
  });

  it("normalizes a nested list-of-lists response", async () => {
    reply({ output: [[{ label: "joy", score: 0.7 }]] });
    const node = new TextClassificationNode({ inputs: "yay" });
    const out = await node.process(ctx);
    expect(out.output).toBe("joy");
  });
});

describe("ChatCompletionNode", () => {
  it("calls the chat-completion route and returns content", async () => {
    reply({ output: { choices: [{ message: { content: "42" } }] } });
    const node = new ChatCompletionNode({
      prompt: "meaning of life?",
      system: "Be terse"
    });
    const out = await node.process(ctx);
    expect(out.output).toBe("42");

    expect(request()).toMatchObject({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      route: "chat-completion",
      input: {
        messages: [
          { role: "system", content: "Be terse" },
          { role: "user", content: "meaning of life?" }
        ]
      }
    });
  });
});

describe("QuestionAnsweringNode", () => {
  it("sends question/context and returns the answer", async () => {
    reply({ output: { answer: "Paris", score: 0.99, start: 0, end: 5 } });
    const node = new QuestionAnsweringNode({
      question: "Capital of France?",
      context: "Paris is the capital of France."
    });
    const out = await node.process(ctx);
    expect(out.output).toBe("Paris");
    expect(out.score).toBeCloseTo(0.99);

    expect(request()).toMatchObject({
      route: "question-answering",
      input: {
        inputs: {
          question: "Capital of France?",
          context: "Paris is the capital of France."
        }
      }
    });
  });

  it("throws when context is empty", async () => {
    const node = new QuestionAnsweringNode({ question: "?", context: "" });
    await expect(node.process(ctx)).rejects.toThrow(/Context/);
  });
});

describe("ZeroShotClassificationNode", () => {
  it("parses the classic {labels, scores} response", async () => {
    reply({
      output: {
        sequence: "I need a refund",
        labels: ["billing", "tech"],
        scores: [0.9, 0.1]
      }
    });
    const node = new ZeroShotClassificationNode({
      inputs: "I need a refund",
      candidate_labels: "billing, tech, sales"
    });
    const out = await node.process(ctx);
    expect(out.output).toBe("billing");
  });

  it("throws when no labels are given", async () => {
    const node = new ZeroShotClassificationNode({
      inputs: "x",
      candidate_labels: ""
    });
    await expect(node.process(ctx)).rejects.toThrow(/candidate label/);
  });
});

describe("TextToImageNode", () => {
  it("returns an image ref from binary bytes", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    reply({ output: { data: png, mimeType: "image/png" } });
    const node = new TextToImageNode({ prompt: "a cat" });
    const out = await node.process(ctx);
    const ref = out.output as Record<string, unknown>;
    expect(ref.type).toBe("image");
    expect(ref.content_type).toBe("image/png");
    expect(String(ref.data)).not.toMatch(/^data:/);
    expect(ref.data).toBe(Buffer.from(png).toString("base64"));
    expect(request().route).toBe("text-to-image");
  });

  it("falls back to image/png when the mime type is not an image", async () => {
    reply({
      output: { data: new Uint8Array([1]), mimeType: "application/octet-stream" }
    });
    const out = await new TextToImageNode({ prompt: "a cat" }).process(ctx);
    expect((out.output as Record<string, unknown>).content_type).toBe("image/png");
  });

  it("throws on empty prompt", async () => {
    const node = new TextToImageNode({ prompt: "" });
    await expect(node.process(ctx)).rejects.toThrow(/Prompt/);
  });
});

describe("TextToVideoNode", () => {
  it("returns a video ref from binary bytes", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 24]);
    reply({ output: { data: mp4, mimeType: "video/mp4" } });
    const node = new TextToVideoNode({ prompt: "a dog running" });
    const out = await node.process(ctx);
    expect((out.output as Record<string, unknown>).type).toBe("video");
    expect(request()).toMatchObject({
      model: "Wan-AI/Wan2.2-T2V-A14B",
      route: "text-to-video",
      input: { inputs: "a dog running" }
    });
  });
});

describe("ObjectDetectionNode", () => {
  it("base64-encodes the image and returns detections", async () => {
    reply({
      output: [
        { label: "cat", score: 0.95, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } }
      ]
    });
    const node = new ObjectDetectionNode({
      image: { type: "image", data: Buffer.from("img").toString("base64") }
    });
    const out = await node.process(ctx);
    expect((out.output as unknown[]).length).toBe(1);

    expect(request()).toMatchObject({
      route: "object-detection",
      input: { inputs: Buffer.from("img").toString("base64") }
    });
  });
});

describe("AutomaticSpeechRecognitionNode", () => {
  it("transcribes audio to text", async () => {
    reply({ output: { text: "hello world" } });
    const node = new AutomaticSpeechRecognitionNode({
      audio: { type: "audio", data: Buffer.from("wav").toString("base64") }
    });
    const out = await node.process(ctx);
    expect(out.output).toBe("hello world");
    expect(request().route).toBe("automatic-speech-recognition");
  });

  it("throws when audio is missing", async () => {
    const node = new AutomaticSpeechRecognitionNode({});
    await expect(node.process(ctx)).rejects.toThrow(/audio is required/);
  });
});
