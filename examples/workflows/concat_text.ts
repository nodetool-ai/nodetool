import { workflow, constant, text } from "@nodetool-ai/dsl";

const greeting = constant.string({ value: "Hello, " });
const name = constant.string({ value: "NodeTool!" });
const result = text.concat({ a: greeting.outputs.output, b: name.outputs.output });

export const wf = workflow(result);
