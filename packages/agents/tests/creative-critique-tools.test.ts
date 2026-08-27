/**
 * Tests for the VLM-judge creative critique tools: critique_image,
 * compare_images, score_image_adherence.
 *
 * All judging goes through `ProcessingContext.runProviderPrediction` with the
 * `generate_message` capability; that surface is mocked here — no providers,
 * network, or database.
 */

import { describe, it, expect, vi } from "vitest";
import type { Message, MessageContent } from "@nodetool-ai/protocol";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const critiqueImageTool = () => toolForCapabilityName("critique_image");
const compareImagesTool = () => toolForCapabilityName("compare_images");
const scoreImageAdherenceTool = () =>
  toolForCapabilityName("score_image_adherence");

function makeContext(runProviderPrediction?: ReturnType<typeof vi.fn>): any {
  return { runProviderPrediction, userId: "user-1" };
}

function reply(json: unknown): Message {
  return { role: "assistant", content: JSON.stringify(json) };
}

/** URIs of the image parts of the single user message in a judge call. */
function imageUris(call: unknown[]): string[] {
  const params = (call[0] as { params: { messages: Message[] } }).params;
  const content = params.messages[0].content as MessageContent[];
  return content
    .filter((p): p is Extract<MessageContent, { type: "image_url" }> =>
      p.type === "image_url"
    )
    .map((p) => p.image.uri ?? "");
}

function promptText(call: unknown[]): string {
  const params = (call[0] as { params: { messages: Message[] } }).params;
  const content = params.messages[0].content as MessageContent[];
  return content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n");
}

/* ---------------- critique_image ---------------- */

describe("critique_image", () => {
  it("validates provider/model/image/brief", async () => {
    const tool = critiqueImageTool();
    expect(
      ((await tool.process(makeContext(), { model: "m", image: "i", brief: "b" })) as any)
        .error
    ).toContain("provider");
    expect(
      ((await tool.process(makeContext(), {
        provider: "p",
        model: "m",
        brief: "b"
      })) as any).error
    ).toBe("image is required");
    expect(
      ((await tool.process(makeContext(), {
        provider: "p",
        model: "m",
        image: "i"
      })) as any).error
    ).toBe("brief is required");
  });

  it("returns a parsed critique and normalizes bare asset ids", async () => {
    const rpp = vi.fn().mockResolvedValue(
      reply({
        verdict: "revise",
        defects: [
          { defect: "text illegible", location: "bottom third", fix: "larger type" }
        ],
        strengths: ["strong palette"]
      })
    );
    const tool = critiqueImageTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "openai",
      model: "gpt-5",
      image: "abc123",
      brief: "A poster",
      taste_profile: "- prefers muted palettes"
    })) as any;

    expect(r.verdict).toBe("revise");
    expect(r.defects).toEqual([
      { defect: "text illegible", location: "bottom third", fix: "larger type" }
    ]);
    expect(r.strengths).toEqual(["strong palette"]);
    expect(rpp).toHaveBeenCalledTimes(1);
    expect(imageUris(rpp.mock.calls[0])).toEqual(["asset://abc123"]);
    expect(promptText(rpp.mock.calls[0])).toContain("prefers muted palettes");
    // Judging runs deterministically.
    expect((rpp.mock.calls[0][0] as any).params.temperature).toBe(0);
  });

  it("errors on unparseable judge output", async () => {
    const rpp = vi.fn().mockResolvedValue({ role: "assistant", content: "nope" });
    const tool = critiqueImageTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      image: "asset://x",
      brief: "b"
    })) as any;
    expect(r.error).toContain("parseable JSON");
  });
});

/* ---------------- compare_images ---------------- */

describe("compare_images", () => {
  it("rejects bad image lists", async () => {
    const tool = compareImagesTool();
    const one = (await tool.process(makeContext(), {
      provider: "p",
      model: "m",
      images: ["only-one"],
      brief: "b"
    })) as any;
    expect(one.error).toContain("2-8");
    const nine = (await tool.process(makeContext(), {
      provider: "p",
      model: "m",
      images: Array.from({ length: 9 }, (_, i) => `i${i}`),
      brief: "b"
    })) as any;
    expect(nine.error).toContain("at most 8");
  });

  it("picks a stable winner from two order-swapped calls per match", async () => {
    // The judge always prefers a.png regardless of presentation order.
    const rpp = vi.fn().mockImplementation(async (req: any) => {
      const uris = imageUris([req]);
      const winner = uris.indexOf("asset://a.png") === 0 ? 1 : 2;
      return reply({ winner, reason: "cleaner composition" });
    });
    const tool = compareImagesTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      images: ["a.png", "b.png"],
      brief: "b"
    })) as any;

    // The winner is reported by the caller's original identifier.
    expect(r.winner).toBe("a.png");
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].agreed).toBe(true);
    expect(rpp).toHaveBeenCalledTimes(2);
    // Second call presents the pair in reversed order.
    expect(imageUris(rpp.mock.calls[0])).toEqual(["asset://a.png", "asset://b.png"]);
    expect(imageUris(rpp.mock.calls[1])).toEqual(["asset://b.png", "asset://a.png"]);
  });

  it("runs a tiebreak call when the order-swapped verdicts disagree", async () => {
    // Position-biased judge: always prefers whichever image is shown first.
    const rpp = vi
      .fn()
      .mockImplementation(async () => reply({ winner: 1, reason: "first looks best" }));
    const tool = compareImagesTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      images: ["a.png", "b.png"],
      brief: "b"
    })) as any;

    expect(rpp).toHaveBeenCalledTimes(3);
    expect(r.matches[0].agreed).toBe(false);
    expect(r.matches[0].reason).toContain("order-sensitive");
    expect(["a.png", "b.png"]).toContain(r.winner);
  });

  it("runs a knockout over more than two candidates with byes", async () => {
    // Preference order c > a > b, stable across presentation order.
    const rank: Record<string, number> = {
      "asset://a.png": 1,
      "asset://b.png": 2,
      "asset://c.png": 0
    };
    const rpp = vi.fn().mockImplementation(async (req: any) => {
      const uris = imageUris([req]);
      const winner = rank[uris[0]] < rank[uris[1]] ? 1 : 2;
      return reply({ winner, reason: "better" });
    });
    const tool = compareImagesTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      images: ["a.png", "b.png", "c.png"],
      brief: "b"
    })) as any;

    // Round 1: a vs b (a wins), c gets a bye. Round 2: a vs c (c wins).
    expect(r.winner).toBe("c.png");
    expect(r.matches).toHaveLength(2);
    expect(rpp).toHaveBeenCalledTimes(4);
  });

  it("surfaces judge failures as an error", async () => {
    const rpp = vi.fn().mockRejectedValue(new Error("provider down"));
    const tool = compareImagesTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      images: ["a.png", "b.png"],
      brief: "b"
    })) as any;
    expect(r.error).toContain("provider down");
  });
});

/* ---------------- score_image_adherence ---------------- */

describe("score_image_adherence", () => {
  it("decomposes the brief, answers each check, and scores", async () => {
    const rpp = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ questions: ["Is there a fox?", "Is it snowing?", "Is the fox red?"] })
      )
      .mockResolvedValueOnce(
        reply({
          answers: [
            { question: "Is there a fox?", answer: "yes", note: "" },
            { question: "Is it snowing?", answer: "no", note: "clear sky" },
            { question: "Is the fox red?", answer: "yes", note: "" }
          ]
        })
      );
    const tool = scoreImageAdherenceTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      image: "img1",
      brief: "a red fox in snow"
    })) as any;

    expect(rpp).toHaveBeenCalledTimes(2);
    // Decomposition call is text-only; the answer call carries the image.
    expect(imageUris(rpp.mock.calls[0])).toEqual([]);
    expect(imageUris(rpp.mock.calls[1])).toEqual(["asset://img1"]);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.passed).toBe(2);
    expect(r.total).toBe(3);
    expect(r.failed).toEqual([
      { question: "Is it snowing?", answer: "no", note: "clear sky" }
    ]);
  });

  it("skips decomposition when questions are supplied", async () => {
    const rpp = vi.fn().mockResolvedValue(
      reply({ answers: [{ question: "Is it a logo?", answer: "yes", note: "" }] })
    );
    const tool = scoreImageAdherenceTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      image: "img1",
      brief: "a logo",
      questions: ["Is it a logo?"]
    })) as any;

    expect(rpp).toHaveBeenCalledTimes(1);
    expect(r.score).toBe(1);
  });

  it("errors when decomposition yields no checks", async () => {
    const rpp = vi.fn().mockResolvedValue({ role: "assistant", content: "??" });
    const tool = scoreImageAdherenceTool();
    const r = (await tool.process(makeContext(rpp), {
      provider: "p",
      model: "m",
      image: "img1",
      brief: "b"
    })) as any;
    expect(r.error).toContain("decompose");
  });
});

/* ---------------- taste tools ---------------- */
