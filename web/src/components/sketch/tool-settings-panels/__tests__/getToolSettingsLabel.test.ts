/**
 * @jest-environment node
 */
import { getToolSettingsLabel } from "../getToolSettingsLabel";
import type { SketchTool } from "../../types";

describe("getToolSettingsLabel", () => {
  const expectedLabels: Array<[SketchTool, string]> = [
    ["brush", "Brush"],
    ["pencil", "Pencil"],
    ["eraser", "Eraser"],
    ["fill", "Fill"],
    ["blur", "Blur Brush"],
    ["gradient", "Gradient"],
    ["crop", "Crop"],
    ["select", "Selection"],
    ["adjust", "Adjustments"],
    ["segment", "Segment"],
    ["shape", "Shape"],
    ["transform", "Transform"]
  ];

  it.each(expectedLabels)(
    'returns "%s" → "%s"',
    (tool, expected) => {
      expect(getToolSettingsLabel(tool)).toBe(expected);
    }
  );

  it('returns "Settings" for tools without a specific label', () => {
    expect(getToolSettingsLabel("move")).toBe("Settings");
    expect(getToolSettingsLabel("eyedropper")).toBe("Settings");
    expect(getToolSettingsLabel("clone_stamp")).toBe("Settings");
  });

  it('returns "Settings" for unknown tool values', () => {
    expect(getToolSettingsLabel("unknown" as SketchTool)).toBe("Settings");
  });
});
