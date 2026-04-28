import { workflow, constant, list } from "@nodetool-ai/dsl";

const items = constant.list({ value: [1, 2, 3, 4, 5] });

// Get the length
const len = list.length({ values: items.output });

// Slice the first 3 elements
const first3 = list.slice({ values: items.output, start: 0, stop: 3 });

// Append a new element
const extended = list.append({ values: items.output, value: 6 });

const wf = workflow(len, first3, extended);
console.log(JSON.stringify(wf));
