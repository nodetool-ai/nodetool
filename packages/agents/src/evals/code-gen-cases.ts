/**
 * Built-in evaluation cases for Code node AI authoring (`CodePlanner`).
 *
 * One case per shape the feature is meant to cover — reshape, merge/join,
 * compute, extract/parse, split, format, validate, seed — each an instruction
 * plus structural expectations on the accepted submission. Expectations never
 * pin exact code: many bodies are right answers, but all of them must declare
 * the outputs the instruction asked for, keep to the inputs on offer, emit
 * every output on every path, and stay inside the sandbox API.
 */

import type { CodeGenTypeMetadata } from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import type { CodeGenEvalCase } from "./code-gen-eval.js";

const STR = { type: "str" };
const FLOAT = { type: "float" };
const DICT = { type: "dict" };
const listOf = (item: CodeGenTypeMetadata): CodeGenTypeMetadata => ({
  type: "list",
  type_args: [item]
});

export const CODE_GEN_EVAL_CASES: readonly CodeGenEvalCase[] = [
  {
    id: "reshape",
    description: "Reshape a list of records into a keyed lookup",
    instruction:
      "Turn the list of user records into an object keyed by each record's id, with the record as the value. Also report how many records were keyed.",
    inputs: [
      {
        name: "users",
        type: listOf(DICT),
        description: "Records, each with an `id` field"
      }
    ],
    expect: {
      requiredOutputs: ["count"],
      outputTypes: { count: ["int", "float"] },
      minOutputs: 2,
      maxOutputs: 3
    }
  },
  {
    id: "merge-join",
    description: "Join two lists on a shared key",
    instruction:
      "Join the orders to the customers on order.customer_id === customer.id. Return the joined rows, each order enriched with the customer's name, and the orders that matched no customer.",
    inputs: [
      { name: "orders", type: listOf(DICT) },
      { name: "customers", type: listOf(DICT) }
    ],
    expect: {
      minOutputs: 2,
      requiredCodePatterns: ["orders", "customers"]
    }
  },
  {
    id: "compute-derive",
    description: "Derive totals from line items",
    instruction:
      "Compute the subtotal of the line items (each has price and quantity), the tax at the given rate, and the grand total.",
    inputs: [
      { name: "items", type: listOf(DICT) },
      { name: "taxRate", type: FLOAT, default: 0.2 }
    ],
    expect: {
      minOutputs: 3,
      // Subtotal, tax and grand total are all money. An earlier version also
      // demanded an int output, which nothing in the instruction asks for —
      // the eval was wrong, not the model.
      outputTypeKinds: ["float"]
    }
  },
  {
    id: "extract-parse",
    description: "Parse a delimited text format by hand",
    instruction:
      "Each line of the log text is `level|timestamp|message`. Parse it into one record per line, and also return how many records have level 'ERROR'.",
    inputs: [{ name: "logText", type: STR }],
    expect: {
      minOutputs: 2,
      // This authoring surface declares no sandbox packages, so `analyzeGeneratedCode`
      // refuses a module declaration outright. Parsing has to be hand-rolled.
      forbiddenCodePatterns: ["\\brequire\\(", "\\bimport\\s"]
    }
  },
  {
    id: "split",
    description: "Split text and report the pieces plus a count",
    instruction:
      "Split the text into sentences. Return the sentences and how many there are.",
    inputs: [{ name: "text", type: STR }],
    expect: {
      minOutputs: 2,
      outputTypeKinds: ["list", "int"]
    }
  },
  {
    id: "format-render",
    description: "Format a number for display through the format bridge",
    instruction:
      "Format the amount as a currency string in the given currency code using the sandbox's number formatter, and return the formatted string.",
    inputs: [
      { name: "amount", type: FLOAT },
      { name: "currency", type: STR, default: "EUR" }
    ],
    expect: {
      minOutputs: 1,
      requiredCodePatterns: ["format\\.number"],
      outputTypeKinds: ["str"]
    }
  },
  {
    id: "validate",
    description: "Validate a record and emit both outputs on every path",
    instruction:
      "Check the record: it must have a non-empty name and an email containing '@'. Return whether it is valid and the list of problems found.",
    inputs: [{ name: "record", type: DICT }],
    expect: {
      minOutputs: 2,
      outputTypeKinds: ["bool", "list"]
    }
  },
  {
    id: "seed",
    description:
      "Produce a value with no inputs, seeded from a destination handle",
    instruction:
      "Produce the twelve month names in English, in calendar order.",
    expectedOutput: { name: "months", type: listOf(STR) },
    expect: {
      requiredOutputs: ["months"],
      minOutputs: 1,
      maxOutputs: 1
    }
  }
] satisfies readonly CodeGenEvalCase[];
