import { nodeInputsToCodeGenPorts } from "../codeGenSubmission";

describe("nodeInputsToCodeGenPorts", () => {
  it("drops slot names that are not valid identifiers", () => {
    const ports = nodeInputsToCodeGenPorts({
      rows: {
        type: {
          type: "list",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        description: "the rows"
      },
      "not an identifier": {
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }
    });
    expect(ports).toEqual([
      {
        name: "rows",
        type: {
          type: "list",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        description: "the rows"
      }
    ]);
  });

  it("returns nothing for a node with no dynamic inputs", () => {
    expect(nodeInputsToCodeGenPorts(undefined)).toEqual([]);
  });
});
