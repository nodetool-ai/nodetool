import { workflow, constant, text } from "@nodetool-ai/dsl";

const greeting = constant.string({ value: "Hello, " });
const name = constant.string({ value: "NodeTool!" });
const result = text.concat({ a: greeting.output, b: name.output });

const wf = workflow(result);
console.log(JSON.stringify(wf));
