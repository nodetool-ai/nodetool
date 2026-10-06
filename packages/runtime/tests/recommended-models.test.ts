/**
 * Structural-invariant tests for the recommended-models catalog.
 *
 * The list is curated data, but the invariants below are behavioural: the API
 * and CLI rely on every entry having a non-empty id/name, a provider, a valid
 * modality, and `downloaded === false` before cache discovery. A literal
 * mutated to "" or an emptied entry/array violates one of these, so the data
 * mutants die without the test having to duplicate the catalog content.
 */
import { describe, it, expect } from "vitest";
import { RECOMMENDED_MODELS } from "../src/recommended-models.js";

const MODALITIES = ["language", "image", "tts", "asr", "video", "music"];
const TYPES = [
  "language_model",
  "embedding_model",
  "image_model",
  "asr_model",
  "tts_model",
  "music_model",
  "video_model",
  "hf.whisper_cpp",
  "hf.whisper_cpp_vad"
];
const TASKS = [
  "text_generation",
  "embedding",
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video"
];

describe("RECOMMENDED_MODELS catalog invariants", () => {
  it("is a non-empty list", () => {
    expect(Array.isArray(RECOMMENDED_MODELS)).toBe(true);
    expect(RECOMMENDED_MODELS.length).toBeGreaterThan(0);
  });

  for (const [i, m] of RECOMMENDED_MODELS.entries()) {
    describe(`entry ${i} (${m.id} / ${m.task ?? "—"})`, () => {
      it("has a non-empty id and name", () => {
        expect(m.id.length).toBeGreaterThan(0);
        expect(m.name.length).toBeGreaterThan(0);
      });

      it("declares a provider", () => {
        expect(m.provider).toBeTruthy();
      });

      it("uses a known modality and model type", () => {
        expect(MODALITIES).toContain(m.modality);
        expect(TYPES).toContain(m.type);
      });

      it("uses a known task when one is set", () => {
        if (m.task !== undefined) {
          expect(TASKS).toContain(m.task);
        }
      });

      it("starts undownloaded and identifies its model source", () => {
        expect(m.downloaded).toBe(false);
        if (m.provider === "whisper_cpp") {
          expect(m.repo_id).toMatch(
            /^(ggerganov\/whisper\.cpp|ggml-org\/whisper-vad)$/
          );
          expect(m.path).toMatch(/^ggml-.+\.bin$/);
          expect(m.type).toMatch(/^hf\.whisper_cpp/);
        } else {
          expect(m.repo_id).toBeNull();
          expect(m.path).toBeNull();
        }
      });
    });
  }

  it("includes the expected anchor models", () => {
    const ids = RECOMMENDED_MODELS.map((m) => m.id);
    expect(ids).toContain("gpt-5-mini");
    expect(ids).toContain("claude-sonnet-5");
    expect(ids).toContain("whisper-1");
  });

  it("uses pinned Anthropic model ids instead of moving latest aliases", () => {
    const anthropicModels = RECOMMENDED_MODELS.filter(
      (model) => model.provider === "anthropic"
    );

    expect(anthropicModels.length).toBeGreaterThan(0);
    for (const model of anthropicModels) {
      expect(model.id).not.toMatch(/-latest$/);
    }
  });
});
