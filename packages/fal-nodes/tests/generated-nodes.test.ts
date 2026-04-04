/**
 * Smoke tests for generated FAL node definitions.
 *
 * These tests verify that every generated category file:
 *  1. Exports a non-empty array of node classes
 *  2. Every class has the required static metadata fields
 *  3. Every class has a process() method
 *  4. The combined FAL_NODES export contains all node classes
 */

import { vi, describe, it, expect } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mock @fal-ai/client — generated nodes import fal-base which needs  */
/*  the SDK to be present even for metadata-only smoke tests.          */
/* ------------------------------------------------------------------ */

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: vi.fn(),
    storage: { upload: vi.fn() }
  }))
}));
import type { NodeClass } from "@nodetool/node-sdk";

import { FAL_3D_TO_3D_NODES } from "../src/generated/3d-to-3d.js";
import { FAL_AUDIO_TO_AUDIO_NODES } from "../src/generated/audio-to-audio.js";
import { FAL_AUDIO_TO_TEXT_NODES } from "../src/generated/audio-to-text.js";
import { FAL_AUDIO_TO_VIDEO_NODES } from "../src/generated/audio-to-video.js";
import { FAL_IMAGE_TO_3D_NODES } from "../src/generated/image-to-3d.js";
import { FAL_IMAGE_TO_IMAGE_NODES } from "../src/generated/image-to-image.js";
import { FAL_IMAGE_TO_JSON_NODES } from "../src/generated/image-to-json.js";
import { FAL_IMAGE_TO_VIDEO_NODES } from "../src/generated/image-to-video.js";
import { FAL_JSON_PROCESSING_NODES } from "../src/generated/json-processing.js";
import { FAL_LLM_NODES } from "../src/generated/llm.js";
import { FAL_SPEECH_TO_SPEECH_NODES } from "../src/generated/speech-to-speech.js";
import { FAL_SPEECH_TO_TEXT_NODES } from "../src/generated/speech-to-text.js";
import { FAL_TEXT_TO_3D_NODES } from "../src/generated/text-to-3d.js";
import { FAL_TEXT_TO_AUDIO_NODES } from "../src/generated/text-to-audio.js";
import { FAL_TEXT_TO_IMAGE_NODES } from "../src/generated/text-to-image.js";
import { FAL_TEXT_TO_JSON_NODES } from "../src/generated/text-to-json.js";
import { FAL_TEXT_TO_SPEECH_NODES } from "../src/generated/text-to-speech.js";
import { FAL_TEXT_TO_VIDEO_NODES } from "../src/generated/text-to-video.js";
import { FAL_TRAINING_NODES } from "../src/generated/training.js";
import { FAL_UNKNOWN_NODES } from "../src/generated/unknown.js";
import { FAL_VIDEO_TO_AUDIO_NODES } from "../src/generated/video-to-audio.js";
import { FAL_VIDEO_TO_TEXT_NODES } from "../src/generated/video-to-text.js";
import { FAL_VIDEO_TO_VIDEO_NODES } from "../src/generated/video-to-video.js";
import { FAL_VISION_NODES } from "../src/generated/vision.js";
import { FAL_NODES, FalRawNode, FalDynamicNode } from "../src/index.js";

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function assertNodeArrayValid(name: string, nodes: readonly NodeClass[]): void {
  describe(name, () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBeGreaterThan(0);
    });

    it("every node has a non-empty nodeType string", () => {
      for (const NodeCls of nodes) {
        expect(typeof NodeCls.nodeType).toBe("string");
        expect((NodeCls.nodeType as string).length).toBeGreaterThan(0);
      }
    });

    it("every node has a non-empty title string", () => {
      for (const NodeCls of nodes) {
        expect(typeof (NodeCls as Record<string, unknown>).title).toBe(
          "string"
        );
        expect(
          ((NodeCls as Record<string, unknown>).title as string).length
        ).toBeGreaterThan(0);
      }
    });

    it("every node has a non-empty description string", () => {
      for (const NodeCls of nodes) {
        expect(typeof (NodeCls as Record<string, unknown>).description).toBe(
          "string"
        );
        expect(
          ((NodeCls as Record<string, unknown>).description as string).length
        ).toBeGreaterThan(0);
      }
    });

    it("every node requires FAL_API_KEY", () => {
      for (const NodeCls of nodes) {
        const settings = (NodeCls as Record<string, unknown>)
          .requiredSettings as string[];
        expect(Array.isArray(settings)).toBe(true);
        expect(settings).toContain("FAL_API_KEY");
      }
    });

    it("every node has a process() method on its prototype", () => {
      for (const NodeCls of nodes) {
        const proto = (NodeCls as { prototype: Record<string, unknown> })
          .prototype;
        expect(typeof proto.process).toBe("function");
      }
    });

    it("nodeType values are unique within the category", () => {
      const types = nodes.map((n) => n.nodeType);
      const unique = new Set(types);
      expect(unique.size).toBe(types.length);
    });
  });
}

/* ================================================================== */
/*  Per-category smoke tests                                            */
/* ================================================================== */

assertNodeArrayValid("FAL_3D_TO_3D_NODES", FAL_3D_TO_3D_NODES);
assertNodeArrayValid("FAL_AUDIO_TO_AUDIO_NODES", FAL_AUDIO_TO_AUDIO_NODES);
assertNodeArrayValid("FAL_AUDIO_TO_TEXT_NODES", FAL_AUDIO_TO_TEXT_NODES);
assertNodeArrayValid("FAL_AUDIO_TO_VIDEO_NODES", FAL_AUDIO_TO_VIDEO_NODES);
assertNodeArrayValid("FAL_IMAGE_TO_3D_NODES", FAL_IMAGE_TO_3D_NODES);
assertNodeArrayValid("FAL_IMAGE_TO_IMAGE_NODES", FAL_IMAGE_TO_IMAGE_NODES);
assertNodeArrayValid("FAL_IMAGE_TO_JSON_NODES", FAL_IMAGE_TO_JSON_NODES);
assertNodeArrayValid("FAL_IMAGE_TO_VIDEO_NODES", FAL_IMAGE_TO_VIDEO_NODES);
assertNodeArrayValid("FAL_JSON_PROCESSING_NODES", FAL_JSON_PROCESSING_NODES);
assertNodeArrayValid("FAL_LLM_NODES", FAL_LLM_NODES);
assertNodeArrayValid("FAL_SPEECH_TO_SPEECH_NODES", FAL_SPEECH_TO_SPEECH_NODES);
assertNodeArrayValid("FAL_SPEECH_TO_TEXT_NODES", FAL_SPEECH_TO_TEXT_NODES);
assertNodeArrayValid("FAL_TEXT_TO_3D_NODES", FAL_TEXT_TO_3D_NODES);
assertNodeArrayValid("FAL_TEXT_TO_AUDIO_NODES", FAL_TEXT_TO_AUDIO_NODES);
assertNodeArrayValid("FAL_TEXT_TO_IMAGE_NODES", FAL_TEXT_TO_IMAGE_NODES);
assertNodeArrayValid("FAL_TEXT_TO_JSON_NODES", FAL_TEXT_TO_JSON_NODES);
assertNodeArrayValid("FAL_TEXT_TO_SPEECH_NODES", FAL_TEXT_TO_SPEECH_NODES);
assertNodeArrayValid("FAL_TEXT_TO_VIDEO_NODES", FAL_TEXT_TO_VIDEO_NODES);
assertNodeArrayValid("FAL_TRAINING_NODES", FAL_TRAINING_NODES);
assertNodeArrayValid("FAL_UNKNOWN_NODES", FAL_UNKNOWN_NODES);
assertNodeArrayValid("FAL_VIDEO_TO_AUDIO_NODES", FAL_VIDEO_TO_AUDIO_NODES);
assertNodeArrayValid("FAL_VIDEO_TO_TEXT_NODES", FAL_VIDEO_TO_TEXT_NODES);
assertNodeArrayValid("FAL_VIDEO_TO_VIDEO_NODES", FAL_VIDEO_TO_VIDEO_NODES);
assertNodeArrayValid("FAL_VISION_NODES", FAL_VISION_NODES);

/* ================================================================== */
/*  FAL_NODES combined export                                           */
/* ================================================================== */

describe("FAL_NODES combined export", () => {
  it("is a non-empty readonly array", () => {
    expect(Array.isArray(FAL_NODES)).toBe(true);
    expect(FAL_NODES.length).toBeGreaterThan(0);
  });

  it("contains all category nodes", () => {
    const allCategoryNodes = [
      ...FAL_3D_TO_3D_NODES,
      ...FAL_AUDIO_TO_AUDIO_NODES,
      ...FAL_AUDIO_TO_TEXT_NODES,
      ...FAL_AUDIO_TO_VIDEO_NODES,
      ...FAL_IMAGE_TO_3D_NODES,
      ...FAL_IMAGE_TO_IMAGE_NODES,
      ...FAL_IMAGE_TO_JSON_NODES,
      ...FAL_IMAGE_TO_VIDEO_NODES,
      ...FAL_JSON_PROCESSING_NODES,
      ...FAL_LLM_NODES,
      ...FAL_SPEECH_TO_SPEECH_NODES,
      ...FAL_SPEECH_TO_TEXT_NODES,
      ...FAL_TEXT_TO_3D_NODES,
      ...FAL_TEXT_TO_AUDIO_NODES,
      ...FAL_TEXT_TO_IMAGE_NODES,
      ...FAL_TEXT_TO_JSON_NODES,
      ...FAL_TEXT_TO_SPEECH_NODES,
      ...FAL_TEXT_TO_VIDEO_NODES,
      ...FAL_TRAINING_NODES,
      ...FAL_UNKNOWN_NODES,
      ...FAL_VIDEO_TO_AUDIO_NODES,
      ...FAL_VIDEO_TO_TEXT_NODES,
      ...FAL_VIDEO_TO_VIDEO_NODES,
      ...FAL_VISION_NODES
    ];
    expect(FAL_NODES.length).toBe(allCategoryNodes.length);
  });

  it("has globally unique nodeType values", () => {
    const types = FAL_NODES.map((n) => n.nodeType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it("all nodeType strings start with 'fal.'", () => {
    for (const NodeCls of FAL_NODES) {
      expect((NodeCls.nodeType as string).startsWith("fal.")).toBe(true);
    }
  });
});

/* ================================================================== */
/*  Index exports — dynamic nodes                                       */
/* ================================================================== */

describe("Index exports — dynamic nodes", () => {
  it("exports FalRawNode", () => {
    expect(FalRawNode).toBeDefined();
    expect(typeof FalRawNode).toBe("function");
  });

  it("exports FalDynamicNode", () => {
    expect(FalDynamicNode).toBeDefined();
    expect(typeof FalDynamicNode).toBe("function");
  });
});

/* ================================================================== */
/*  registerFalNodes                                                    */
/* ================================================================== */

describe("registerFalNodes", () => {
  it("registers every node from FAL_NODES into the provided registry", async () => {
    const { registerFalNodes } = await import("../src/index.js");
    const registered: NodeClass[] = [];
    const registry = {
      register: (nodeClass: NodeClass) => registered.push(nodeClass)
    };
    registerFalNodes(registry);
    expect(registered.length).toBe(FAL_NODES.length);
    // Every registered class should appear in FAL_NODES
    for (const cls of registered) {
      expect(FAL_NODES).toContain(cls);
    }
  });
});
