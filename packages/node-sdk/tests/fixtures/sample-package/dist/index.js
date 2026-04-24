// Pre-built entry for scanner tests. Uses the NodeRegistry passed in
// (instance method loadMetadata) rather than importing node-sdk, since
// this file lives in a fixture without access to the built dist/.

export function registerNodes(registry) {
  registry.loadMetadata("sample.Adder", {
    title: "Adder",
    description: "Adds two numbers.",
    namespace: "sample",
    node_type: "sample.Adder",
    properties: [
      { name: "a", type: { type: "int", type_args: [] }, default: 0 },
      { name: "b", type: { type: "int", type_args: [] }, default: 0 }
    ],
    outputs: [{ name: "sum", type: { type: "int", type_args: [] } }]
  });
  registry.loadMetadata("sample.Echo", {
    title: "Echo",
    description: "Repeats text.",
    namespace: "sample",
    node_type: "sample.Echo",
    properties: [
      { name: "text", type: { type: "str", type_args: [] }, default: "" }
    ],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }]
  });
}
