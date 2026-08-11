/**
 * End-to-end tests for the OCR node library:
 *  - OCR: tesseract.js node registration / interface
 */
import { describe, expect, it } from "vitest";
import { OcrExtractTextLibNode, OcrExtractDataLibNode } from "../../src/index.js";
import { makeRegistry } from "./helpers.js";

describe("OCR nodes (registration & interface)", () => {
  // tesseract.js downloads language data on first call which is too heavy
  // for a unit test. We validate node interface and that a missing image
  // raises a clear error so the workflow surface is correct.
  it("registers in the base node registry", () => {
    const registry = makeRegistry();
    expect(registry.has(OcrExtractTextLibNode.nodeType)).toBe(true);
    expect(registry.has(OcrExtractDataLibNode.nodeType)).toBe(true);
  });

  it("throws a clear error when no image data is provided", async () => {
    const node = new OcrExtractTextLibNode();
    node.assign({ image: {} });
    await expect(node.process()).rejects.toThrow("No image data or URI provided");
  });
});
