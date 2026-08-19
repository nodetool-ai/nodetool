/**
 * @jest-environment node
 */
import {
  CUSTOM_NODE_PREFIX,
  customNodeType,
  findCustomNodeScript,
  generateCustomNodeMetadata,
  setCustomNodeScripts,
  type CustomNodeScript
} from "../customNodeMetadata";

function script(
  overrides: Partial<CustomNodeScript> = {},
  document: Partial<CustomNodeScript["document"]> = {}
): CustomNodeScript {
  return {
    id: "abc-123",
    name: "Invoice number",
    version: 4,
    document: {
      description: "Formats our invoice numbers",
      code: 'await output("formatted", inputs.raw);',
      inputs: [{ name: "raw", type: "str" }],
      outputs: [{ name: "formatted", type: "str" }],
      secrets: [],
      timeoutSeconds: 30,
      palette: { category: "My API" },
      ...document
    },
    ...overrides
  };
}

describe("customNodeType", () => {
  it("keys on the script id under the slugged category", () => {
    expect(customNodeType(script())).toBe(`${CUSTOM_NODE_PREFIX}my_api.abc_123`);
  });

  it("falls back to a category when the slug is empty", () => {
    expect(customNodeType(script({}, { palette: { category: "!!" } }))).toBe(
      `${CUSTOM_NODE_PREFIX}my_nodes.abc_123`
    );
  });
});

describe("generateCustomNodeMetadata", () => {
  it("maps declared ports to typed properties and outputs", () => {
    const metadata = generateCustomNodeMetadata([
      script({}, {
        inputs: [
          { name: "raw", type: "str" },
          { name: "retries", type: "int" },
          { name: "strict", type: "bool" }
        ],
        outputs: [
          { name: "formatted", type: "str" },
          { name: "rows", type: "list" }
        ]
      })
    ]);

    const entry = metadata[`${CUSTOM_NODE_PREFIX}my_api.abc_123`];
    expect(entry.title).toBe("Invoice number");
    expect(entry.description).toBe("Formats our invoice numbers");
    expect(entry.namespace).toBe(`${CUSTOM_NODE_PREFIX}my_api`);
    expect(entry.supports_dynamic_inputs).toBe(true);
    expect(entry.supports_dynamic_outputs).toBe(true);
    expect(entry.properties).toEqual([
      {
        name: "raw",
        type: { type: "str", type_args: [], optional: false },
        default: "",
        required: false
      },
      {
        name: "retries",
        type: { type: "int", type_args: [], optional: false },
        default: 0,
        required: false
      },
      {
        name: "strict",
        type: { type: "bool", type_args: [], optional: false },
        default: false,
        required: false
      }
    ]);
    expect(entry.outputs).toEqual([
      {
        name: "formatted",
        type: { type: "str", type_args: [], optional: false },
        stream: false
      },
      {
        name: "rows",
        type: { type: "list", type_args: [], optional: false },
        stream: false
      }
    ]);
  });

  it("skips a script its owner has not exposed", () => {
    const metadata = generateCustomNodeMetadata([
      script({}, { palette: undefined })
    ]);
    expect(Object.keys(metadata)).toEqual([]);
  });
});

describe("the drop registry", () => {
  afterEach(() => setCustomNodeScripts([]));

  it("finds an exposed script by its virtual type and nothing else", () => {
    const exposed = script();
    setCustomNodeScripts([exposed, script({ id: "hidden" }, { palette: undefined })]);

    expect(findCustomNodeScript(customNodeType(exposed))).toBe(exposed);
    expect(findCustomNodeScript("nodetool.text.Concat")).toBeUndefined();
    expect(findCustomNodeScript(`${CUSTOM_NODE_PREFIX}my_api.hidden`)).toBeUndefined();
  });

  it("forgets a script that is no longer exposed", () => {
    const exposed = script();
    setCustomNodeScripts([exposed]);
    setCustomNodeScripts([]);
    expect(findCustomNodeScript(customNodeType(exposed))).toBeUndefined();
  });
});
