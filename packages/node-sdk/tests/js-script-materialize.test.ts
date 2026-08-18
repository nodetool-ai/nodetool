import { describe, it, expect } from "vitest";
import { materializeJsScriptNode } from "../src/js-script-materialize.js";

const document = {
  code: 'await output("formatted", inputs.raw);',
  inputs: [
    { name: "raw", type: "str" },
    { name: "retries", type: "int" }
  ],
  outputs: [{ name: "formatted", type: "str" }],
  packages: [{ specifier: "@nodetool-ai/sandbox-yaml" }],
  secrets: ["MY_KEY"],
  timeoutSeconds: 45
};

describe("materializeJsScriptNode", () => {
  it("copies the envelope onto Code node properties and pins the version", () => {
    const { properties } = materializeJsScriptNode(document, {
      id: "abc",
      version: 7
    });

    expect(properties).toEqual({
      script: { id: "abc", version: 7 },
      code: document.code,
      packages: document.packages,
      secrets: document.secrets,
      timeout: 45
    });
  });

  it("turns declared ports into dynamic slots", () => {
    const { dynamic_inputs, dynamic_outputs } = materializeJsScriptNode(
      document,
      { id: "abc", version: 1 }
    );

    expect(dynamic_inputs).toEqual({
      raw: { type: { type: "str", optional: false, type_args: [] } },
      retries: { type: { type: "int", optional: false, type_args: [] } }
    });
    expect(dynamic_outputs).toEqual({
      formatted: { type: "str", optional: false, type_args: [] }
    });
  });

  it("materializes a script with no ports as a node with no slots", () => {
    const bare = { ...document, inputs: [], outputs: [] };
    const result = materializeJsScriptNode(bare, { id: "abc", version: 2 });
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
  });
});
