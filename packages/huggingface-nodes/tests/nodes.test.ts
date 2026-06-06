import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatCompletionNode,
  QuestionAnsweringNode,
  TextClassificationNode,
  ZeroShotClassificationNode
} from "../src/nodes/text.js";
import { TextToImageNode, ObjectDetectionNode } from "../src/nodes/image.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/audio.js";
import { TextToVideoNode } from "../src/nodes/video.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function withSecrets<T extends { setDynamic: (k: string, v: unknown) => void }>(
  node: T
): T {
  node.setDynamic("_secrets", { HF_TOKEN: "hf_test" });
  return node;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TextClassificationNode", () => {
  it("returns the top label and full scores", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([
        { label: "POSITIVE", score: 0.98 },
        { label: "NEGATIVE", score: 0.02 }
      ])
    );
    const node = withSecrets(
      new TextClassificationNode({ inputs: "I love this" })
    );
    const out = await node.process();
    expect(out.output).toBe("POSITIVE");
    expect((out.scores as unknown[]).length).toBe(2);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/hf-inference/models/");
  });

  it("normalizes a nested list-of-lists response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([[{ label: "joy", score: 0.7 }]])
    );
    const node = withSecrets(new TextClassificationNode({ inputs: "yay" }));
    const out = await node.process();
    expect(out.output).toBe("joy");
  });
});

describe("ChatCompletionNode", () => {
  it("hits the OpenAI-compatible route and returns content", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "42" } }] })
    );
    const node = withSecrets(
      new ChatCompletionNode({ prompt: "meaning of life?", system: "Be terse" })
    );
    const out = await node.process();
    expect(out.output).toBe("42");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://router.huggingface.co/v1/chat/completions");
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string }>;
    };
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
  });
});

describe("QuestionAnsweringNode", () => {
  it("sends question/context and returns the answer", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ answer: "Paris", score: 0.99, start: 0, end: 5 })
    );
    const node = withSecrets(
      new QuestionAnsweringNode({
        question: "Capital of France?",
        context: "Paris is the capital of France."
      })
    );
    const out = await node.process();
    expect(out.output).toBe("Paris");
    expect(out.score).toBeCloseTo(0.99);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      inputs: { question: string; context: string };
    };
    expect(body.inputs.question).toBe("Capital of France?");
  });

  it("throws when context is empty", async () => {
    const node = withSecrets(
      new QuestionAnsweringNode({ question: "?", context: "" })
    );
    await expect(node.process()).rejects.toThrow(/Context/);
  });
});

describe("ZeroShotClassificationNode", () => {
  it("parses the classic {labels, scores} response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        sequence: "I need a refund",
        labels: ["billing", "tech"],
        scores: [0.9, 0.1]
      })
    );
    const node = withSecrets(
      new ZeroShotClassificationNode({
        inputs: "I need a refund",
        candidate_labels: "billing, tech, sales"
      })
    );
    const out = await node.process();
    expect(out.output).toBe("billing");
  });

  it("throws when no labels are given", async () => {
    const node = withSecrets(
      new ZeroShotClassificationNode({ inputs: "x", candidate_labels: "" })
    );
    await expect(node.process()).rejects.toThrow(/candidate label/);
  });
});

describe("TextToImageNode", () => {
  it("returns an image ref from binary bytes", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    mockFetch.mockResolvedValue(
      new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    );
    const node = withSecrets(new TextToImageNode({ prompt: "a cat" }));
    const out = await node.process();
    expect((out.output as Record<string, unknown>).type).toBe("image");
    expect(String((out.output as Record<string, unknown>).data)).toMatch(
      /^data:image\/png;base64,/
    );
  });

  it("throws on empty prompt", async () => {
    const node = withSecrets(new TextToImageNode({ prompt: "" }));
    await expect(node.process()).rejects.toThrow(/Prompt/);
  });
});

describe("TextToVideoNode", () => {
  it("returns a video ref from binary bytes", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 24]);
    mockFetch.mockResolvedValue(
      new Response(mp4, { status: 200, headers: { "content-type": "video/mp4" } })
    );
    const node = withSecrets(new TextToVideoNode({ prompt: "a dog running" }));
    const out = await node.process();
    expect((out.output as Record<string, unknown>).type).toBe("video");
  });
});

describe("ObjectDetectionNode", () => {
  it("base64-encodes the image and returns detections", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([
        { label: "cat", score: 0.95, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } }
      ])
    );
    const node = withSecrets(
      new ObjectDetectionNode({
        image: { type: "image", data: Buffer.from("img").toString("base64") }
      })
    );
    const out = await node.process();
    expect((out.output as unknown[]).length).toBe(1);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { inputs: string };
    expect(body.inputs).toBe(Buffer.from("img").toString("base64"));
  });
});

describe("AutomaticSpeechRecognitionNode", () => {
  it("transcribes audio to text", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ text: "hello world" }));
    const node = withSecrets(
      new AutomaticSpeechRecognitionNode({
        audio: { type: "audio", data: Buffer.from("wav").toString("base64") }
      })
    );
    const out = await node.process();
    expect(out.output).toBe("hello world");
  });

  it("throws when audio is missing", async () => {
    const node = withSecrets(new AutomaticSpeechRecognitionNode({}));
    await expect(node.process()).rejects.toThrow(/audio is required/);
  });
});
