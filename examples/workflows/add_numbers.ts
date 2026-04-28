import { workflow, constant, libMath } from "@nodetool-ai/dsl";

const a = constant.float({ value: 3.14 });
const b = constant.float({ value: 2.0 });
const sum = libMath.add({ a: a.output, b: b.output });

const wf = workflow(sum);
console.log(JSON.stringify(wf));
