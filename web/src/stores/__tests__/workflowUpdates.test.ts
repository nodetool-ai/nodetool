import { normalizeOutputUpdateValue } from "../outputUpdateValue";
import type { OutputUpdate } from "../ApiTypes";

describe("normalizeOutputUpdateValue", () => {
  it("wraps raw image output values with their media type", () => {
    const rawValue = { data: [1, 2, 3] };
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-1",
      node_name: "Image Node",
      output_name: "image",
      output_type: "image",
      value: rawValue,
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toEqual({
      type: "image",
      data: [1, 2, 3]
    });
  });

  it("preserves values that already declare their own type", () => {
    const typedValue = { type: "image", data: [1, 2, 3] };
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-1",
      node_name: "Image Node",
      output_name: "image",
      output_type: "image",
      value: typedValue,
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toBe(typedValue);
  });

  it("leaves non-media outputs unchanged", () => {
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-2",
      node_name: "Text Node",
      output_name: "output",
      output_type: "string",
      value: "hello",
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toBe("hello");
  });
});
