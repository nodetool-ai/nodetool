import { extractWorkflowIO, WorkflowInputIO } from "../workflowIO";
import {
  createPropertyForInput,
  normalizeInputValue,
  resolveInputValue
} from "../inputProperty";
import { Workflow } from "../../../stores/ApiTypes";

const makeInput = (over: Partial<WorkflowInputIO>): WorkflowInputIO => ({
  nodeId: "n1",
  nodeType: "nodetool.input.StringInput",
  name: "prompt",
  label: "Prompt",
  kind: "string",
  ...over
});

const makeWorkflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes, edges: [] }
  }) as unknown as Workflow;

describe("extractWorkflowIO extras", () => {
  it("carries description, max_length, line_mode, and enum_type_name", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "s1",
          type: "nodetool.input.StringInput",
          data: {
            name: "prompt",
            description: "The prompt",
            max_length: 12,
            line_mode: "multi_line"
          }
        },
        {
          id: "e1",
          type: "nodetool.input.SelectInput",
          data: {
            name: "mode",
            options: ["a", "b"],
            enum_type_name: "Mode"
          }
        }
      ])
    );
    const prompt = io.inputs.find((i) => i.name === "prompt");
    expect(prompt?.description).toBe("The prompt");
    expect(prompt?.maxLength).toBe(12);
    expect(prompt?.multiline).toBe(true);
    const mode = io.inputs.find((i) => i.name === "mode");
    expect(mode?.enumTypeName).toBe("Mode");
    expect(mode?.options).toEqual(["a", "b"]);
  });
});

describe("createPropertyForInput", () => {
  it("maps a select input to an enum property with values", () => {
    const property = createPropertyForInput(
      makeInput({
        kind: "select",
        options: ["x", "y"],
        enumTypeName: "Choice"
      })
    );
    expect(property.type.type).toBe("enum");
    expect(property.type.values).toEqual(["x", "y"]);
    expect(property.type.type_name).toBe("Choice");
    expect(property.default).toBe("x");
  });

  it("routes path kinds through json_schema_extra", () => {
    expect(
      createPropertyForInput(makeInput({ kind: "file_path" })).json_schema_extra
    ).toEqual({ type: "file_path" });
    expect(
      createPropertyForInput(makeInput({ kind: "folder_path" }))
        .json_schema_extra
    ).toEqual({ type: "folder_path" });
  });

  it("gives list kinds their element type_args", () => {
    const property = createPropertyForInput(makeInput({ kind: "image_list" }));
    expect(property.type.type).toBe("list");
    expect(property.type.type_args?.[0]?.type).toBe("image");
    expect(property.default).toEqual([]);
  });

  it("only numeric kinds carry min/max", () => {
    const int = createPropertyForInput(
      makeInput({ kind: "integer", min: 1, max: 5 })
    );
    expect(int.min).toBe(1);
    expect(int.max).toBe(5);
    const str = createPropertyForInput(makeInput({ min: 1, max: 5 }));
    expect(str.min).toBeNull();
    expect(str.max).toBeNull();
  });
});

describe("resolveInputValue", () => {
  it("prefers the stored value, then the default, then a kind blank", () => {
    const input = makeInput({ defaultValue: "dflt" });
    const property = createPropertyForInput(input);
    expect(resolveInputValue(input, property, "typed")).toBe("typed");
    expect(resolveInputValue(input, property, undefined)).toBe("dflt");

    const bare = makeInput({ kind: "boolean" });
    expect(
      resolveInputValue(bare, createPropertyForInput(bare), undefined)
    ).toBe(false);
  });
});

describe("normalizeInputValue", () => {
  it("rounds and clamps integers", () => {
    const input = makeInput({ kind: "integer", min: 0, max: 10 });
    expect(normalizeInputValue(input, 3.7)).toBe(4);
    expect(normalizeInputValue(input, -2)).toBe(0);
    expect(normalizeInputValue(input, 99)).toBe(10);
  });

  it("clamps floats without rounding", () => {
    const input = makeInput({ kind: "float", min: 0.5, max: 1.5 });
    expect(normalizeInputValue(input, 1.25)).toBe(1.25);
    expect(normalizeInputValue(input, 0.1)).toBe(0.5);
  });

  it("truncates strings to maxLength", () => {
    const input = makeInput({ maxLength: 3 });
    expect(normalizeInputValue(input, "abcdef")).toBe("abc");
    expect(normalizeInputValue(makeInput({}), "abcdef")).toBe("abcdef");
  });

  it("passes other kinds through untouched", () => {
    const input = makeInput({ kind: "boolean" });
    expect(normalizeInputValue(input, true)).toBe(true);
  });
});
