/**
 * Generated training tasks for the JS script editor and the App Builder.
 *
 * JS script tasks are graded on behaviour. After every edit to the body or
 * the ports, the world runs the current document on hidden inputs in the
 * QuickJS sandbox (the path `ui_jsscript_run` takes) and keeps the outputs, so
 * a check asks whether the script computes the right value, not whether its
 * source looks a certain way. The hidden runs use a copy of the document, so
 * the model's own last run and test results stay as it left them.
 *
 * App tasks are graded on the widget tree and its bindings, the same final
 * state the `app-tools` suite scores.
 */
import {
  createAppToolBridge,
  createJsScriptToolBridge,
  type AppBridgeFinalState,
  type AppComponentSummary,
  type HeadlessSurfaceBridge,
  type HeadlessTool,
  type JsScriptBridgeFinalState,
  type SeedComponent
} from "@nodetool-ai/agents";
import { defineFamily, list, type Check, type ErasedFamily, type Picker, type TaskFamily } from "../task-families.js";

// ---------------------------------------------------------------- JS scripts

/** One hidden run: the inputs it used and the outputs it produced, or null on an error. */
interface ProbeResult {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
}

export type ScriptState = JsScriptBridgeFinalState & { probes: ProbeResult[] };

/** Tools that change what the body computes. */
const CHANGES_BEHAVIOUR = new Set(["ui_jsscript_set_code", "ui_jsscript_set_ports"]);

/**
 * A JS script world whose final state also carries the document's outputs on
 * `probes`, re-run after every body or port edit.
 */
async function scriptWorld(
  initial: Parameters<typeof createJsScriptToolBridge>[0],
  probes: Array<Record<string, unknown>>
): Promise<HeadlessSurfaceBridge<ScriptState>> {
  const bridge = createJsScriptToolBridge(initial);
  let results: ProbeResult[] = [];
  const probe = async (): Promise<void> => {
    const shadow = createJsScriptToolBridge({ name: bridge.name(), document: structuredClone(bridge.document()) });
    const run = shadow.tools.find((t) => t.name === "ui_jsscript_run")!;
    const next: ProbeResult[] = [];
    for (const inputs of probes) {
      try {
        const result = (await run.execute({ inputs })) as { ok: boolean; run: { outputs?: Record<string, unknown> } };
        next.push({ inputs, outputs: result.ok ? (result.run.outputs ?? {}) : null });
      } catch {
        next.push({ inputs, outputs: null });
      }
    }
    results = next;
  };
  await probe();
  const tools: HeadlessTool[] = bridge.tools.map((tool) =>
    CHANGES_BEHAVIOUR.has(tool.name)
      ? {
          ...tool,
          execute: async (args) => {
            const result = await tool.execute(args);
            await probe();
            return result;
          }
        }
      : tool
  );
  return { tools, finalState: () => ({ ...bridge.finalState(), probes: results }) };
}

/** Structural equality, with a small tolerance for floats. */
function same(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) < 1e-9;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => same(actual[i], e));
  }
  return actual === expected;
}

const show = (value: unknown): string => JSON.stringify(value);

/** A pure transformation a script can be asked to perform, made concrete by a seed. */
interface ScriptOp {
  title: string;
  inType: string;
  outType: string;
  inNames: readonly string[];
  outNames: readonly string[];
  /** What the output holds, given the input port name. */
  does: (input: string) => string;
  body: (input: string, output: string) => string;
  /** A plausible wrong body. It fails at least one of the first two cases. */
  bug: (input: string, output: string) => string;
  ref: (value: never) => unknown;
  cases: unknown[];
}

const NUMBER_LISTS = ["numbers", "values", "scores", "prices", "readings", "amounts"];
const TEXTS = ["text", "sentence", "phrase", "line", "caption", "words"];
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

const SCRIPT_OPS: ReadonlyArray<(pick: Picker) => ScriptOp> = [
  () => ({
    title: "Sum",
    inType: "list[float]",
    outType: "float",
    inNames: NUMBER_LISTS,
    outNames: ["total", "sum"],
    does: (i) => `the sum of the numbers in \`${i}\``,
    body: (i, o) => `const xs = inputs.${i};\nawait output("${o}", xs.reduce((a, b) => a + b, 0));`,
    bug: (i, o) => `const xs = inputs.${i};\nawait output("${o}", xs.reduce((a, b) => a + b, 1));`,
    ref: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
    cases: [[1, 2, 3], [-2, 5.5], [10], []]
  }),
  (pick) => {
    const places = pick.int(0, 2);
    return {
      title: "Average",
      inType: "list[float]",
      outType: "float",
      inNames: NUMBER_LISTS,
      outNames: ["average", "mean"],
      does: (i) =>
        `the average of the numbers in \`${i}\`, ${places === 0 ? "rounded to a whole number" : `rounded to ${places} decimal place${places === 1 ? "" : "s"}`}`,
      body: (i, o) =>
        `const xs = inputs.${i};\nconst f = 10 ** ${places};\nawait output("${o}", Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * f) / f);`,
      bug: (i, o) =>
        `const xs = inputs.${i};\nconst f = 10 ** ${places};\nawait output("${o}", Math.round((xs.reduce((a, b) => a + b, 0) / (xs.length - 1)) * f) / f);`,
      ref: (xs: number[]) => round(xs.reduce((a, b) => a + b, 0) / xs.length, places),
      cases: [[1, 2, 2], [3, 4, 4, 5], [10, 11, 13], [7]]
    };
  },
  (pick) => {
    const t = pick.one([0, 5, 10, 50]);
    return {
      title: "Count Above",
      inType: "list[float]",
      outType: "int",
      inNames: NUMBER_LISTS,
      outNames: ["count", "above"],
      does: (i) => `how many numbers in \`${i}\` are greater than ${t}`,
      body: (i, o) => `await output("${o}", inputs.${i}.filter((x) => x > ${t}).length);`,
      bug: (i, o) => `await output("${o}", inputs.${i}.filter((x) => x >= ${t}).length);`,
      ref: (xs: number[]) => xs.filter((x) => x > t).length,
      cases: [[t - 1, t, t + 1, t + 20], [t, t], [t + 3], []]
    };
  },
  (pick) => {
    const t = pick.one([0, 5, 10, 50]);
    return {
      title: "Keep Above",
      inType: "list[float]",
      outType: "list[float]",
      inNames: NUMBER_LISTS,
      outNames: ["kept", "filtered", "above"],
      does: (i) => `the numbers in \`${i}\` that are greater than ${t}, in their original order`,
      body: (i, o) => `await output("${o}", inputs.${i}.filter((x) => x > ${t}));`,
      bug: (i, o) => `await output("${o}", inputs.${i}.filter((x) => x >= ${t}));`,
      ref: (xs: number[]) => xs.filter((x) => x > t),
      cases: [[t + 20, t - 1, t, t + 1], [t, t], [t + 3], []]
    };
  },
  () => ({
    title: "Reverse Words",
    inType: "str",
    outType: "str",
    inNames: TEXTS,
    outNames: ["reversed", "flipped"],
    does: (i) => `the words of \`${i}\` in reverse order, joined by single spaces`,
    body: (i, o) => `await output("${o}", String(inputs.${i}).split(/\\s+/).filter(Boolean).reverse().join(" "));`,
    bug: (i, o) => `await output("${o}", String(inputs.${i}).split("").reverse().join(""));`,
    ref: (s: string) => s.split(/\s+/).filter(Boolean).reverse().join(" "),
    cases: ["red green blue", "hello world", "one"]
  }),
  () => ({
    title: "Count Vowels",
    inType: "str",
    outType: "int",
    inNames: TEXTS,
    outNames: ["vowels", "vowel_count"],
    does: (i) => `the number of vowels (a, e, i, o, u, in either case) in \`${i}\``,
    body: (i, o) => `await output("${o}", (String(inputs.${i}).match(/[aeiou]/gi) ?? []).length);`,
    bug: (i, o) => `await output("${o}", (String(inputs.${i}).match(/[aeiou]/g) ?? []).length);`,
    ref: (s: string) => (s.match(/[aeiou]/gi) ?? []).length,
    cases: ["AEIOU xyz", "Banana Split", "rhythm", "Hello"]
  }),
  () => ({
    title: "Title Case",
    inType: "str",
    outType: "str",
    inNames: TEXTS,
    outNames: ["titled", "title_case"],
    does: (i) =>
      `\`${i}\` with every space-separated word capitalized: first letter upper case, the rest lower case`,
    body: (i, o) =>
      `await output("${o}", String(inputs.${i}).split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "));`,
    bug: (i, o) =>
      `await output("${o}", String(inputs.${i}).split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));`,
    ref: (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
    cases: ["hello WORLD", "the QUICK fox", "a"]
  }),
  (pick) => {
    const sep = pick.one(["-", "_"]);
    const slug = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}+|${sep}+$`, "g"), "");
    return {
      title: "Slugify",
      inType: "str",
      outType: "str",
      inNames: ["title", "headline", "name", "heading"],
      outNames: ["slug"],
      does: (i) =>
        `\`${i}\` as a slug: lower case, every run of characters other than a-z and 0-9 replaced by one "${sep}", and no "${sep}" at either end`,
      body: (i, o) =>
        `await output("${o}", String(inputs.${i}).toLowerCase().replace(/[^a-z0-9]+/g, "${sep}").replace(/^${sep}+|${sep}+$/g, ""));`,
      bug: (i, o) => `await output("${o}", String(inputs.${i}).toLowerCase().replace(/[^a-z0-9]+/g, "${sep}"));`,
      ref: slug,
      cases: ["Hello, World!", "  Big  News 2026 ", "a"]
    };
  },
  (pick) => {
    const n = pick.one([6, 8, 10, 12]);
    return {
      title: "Truncate",
      inType: "str",
      outType: "str",
      inNames: TEXTS,
      outNames: ["short", "truncated", "preview"],
      does: (i) =>
        `\`${i}\` cut to at most ${n} characters: longer text is cut and ends in "..." so the result, dots included, is exactly ${n} characters, and text of ${n} characters or fewer is left as it is`,
      body: (i, o) => `const s = String(inputs.${i});\nawait output("${o}", s.length <= ${n} ? s : s.slice(0, ${n - 3}) + "...");`,
      bug: (i, o) => `const s = String(inputs.${i});\nawait output("${o}", s.length <= ${n} ? s : s.slice(0, ${n}) + "...");`,
      ref: (s: string) => (s.length <= n ? s : `${s.slice(0, n - 3)}...`),
      cases: ["abcdefghijklmnopqrstuvwxyz", "abc", "x".repeat(n), "The quick brown fox jumps"]
    };
  },
  () => ({
    title: "Celsius to Fahrenheit",
    inType: "float",
    outType: "float",
    inNames: ["celsius", "temperature", "temp_c"],
    outNames: ["fahrenheit", "temp_f"],
    does: (i) => `the Celsius temperature \`${i}\` converted to Fahrenheit, rounded to 1 decimal place`,
    body: (i, o) => `await output("${o}", Math.round((inputs.${i} * 9 / 5 + 32) * 10) / 10);`,
    bug: (i, o) => `await output("${o}", Math.round(((inputs.${i} + 32) * 9 / 5) * 10) / 10);`,
    ref: (c: number) => round((c * 9) / 5 + 32, 1),
    cases: [100, -40, 0, 37, 21.5]
  }),
  (pick) => {
    const [a, b] = pick.one([[3, 5], [2, 7], [4, 9]] as const);
    const [A, B] = pick.one([["Fizz", "Buzz"], ["Foo", "Bar"], ["Ping", "Pong"]] as const);
    const label = (n: number) =>
      n % a === 0 && n % b === 0 ? A + B : n % a === 0 ? A : n % b === 0 ? B : String(n);
    return {
      title: `${A}${B} Label`,
      inType: "int",
      outType: "str",
      inNames: ["n", "number", "value"],
      outNames: ["label", "word"],
      does: (i) =>
        `"${A}${B}" when \`${i}\` is divisible by both ${a} and ${b}, "${A}" when only by ${a}, "${B}" when only by ${b}, and otherwise the number itself as text`,
      body: (i, o) =>
        `const n = inputs.${i};\nawait output("${o}", n % ${a} === 0 && n % ${b} === 0 ? "${A}${B}" : n % ${a} === 0 ? "${A}" : n % ${b} === 0 ? "${B}" : String(n));`,
      bug: (i, o) =>
        `const n = inputs.${i};\nawait output("${o}", n % ${a} === 0 ? "${A}" : n % ${b} === 0 ? "${B}" : n % ${a} === 0 && n % ${b} === 0 ? "${A}${B}" : String(n));`,
      ref: label,
      cases: [a * b, a, b, a * b + 1, 2 * a * b]
    };
  }
];

/** A second output to add to a script, by input type. */
const EXTRA_OUTPUTS: Record<string, { type: string; names: string[]; does: (i: string) => string; expr: (i: string) => string; ref: (v: never) => unknown }> = {
  "list[float]": {
    type: "int",
    names: ["size", "length", "n_items"],
    does: (i) => `the number of items in \`${i}\``,
    expr: (i) => `inputs.${i}.length`,
    ref: (xs: unknown[]) => xs.length
  },
  str: {
    type: "int",
    names: ["length", "chars", "char_count"],
    does: (i) => `the number of characters in \`${i}\``,
    expr: (i) => `String(inputs.${i}).length`,
    ref: (s: string) => s.length
  },
  float: {
    type: "float",
    names: ["kelvin", "temp_k"],
    does: () => `the same temperature in Kelvin (Celsius plus 273.15), rounded to 2 decimal places`,
    expr: (i) => `Math.round((inputs.${i} + 273.15) * 100) / 100`,
    ref: (c: number) => round(c + 273.15, 2)
  },
  int: {
    type: "bool",
    names: ["is_even", "even"],
    does: (i) => `true when \`${i}\` is even and false otherwise`,
    expr: (i) => `inputs.${i} % 2 === 0`,
    ref: (n: number) => n % 2 === 0
  }
};

const TYPE_WORDS: Record<string, string> = {
  "list[float]": "a list of numbers",
  str: "a string",
  int: "a whole number",
  float: "a number"
};

/** One check per case and expected output, over the probe at the same index. */
function behaviourChecks(
  output: string,
  input: string,
  cases: unknown[],
  ref: (value: never) => unknown,
  offset = 0
): Check<ScriptState>[] {
  return cases.map((value, i) => {
    const expected = ref(value as never);
    return {
      name: `${output} is ${show(expected)} for ${input} = ${show(value)}`,
      test: (s: ScriptState) => {
        const outputs = s.probes[offset + i]?.outputs;
        return !!outputs && output in outputs && same(outputs[output], expected);
      }
    };
  });
}

export const JSSCRIPT_WRITE: TaskFamily<ScriptState> = {
  id: "jsscript-write",
  surface: "jsscript",
  make(pick) {
    const op = pick.one(SCRIPT_OPS)(pick);
    const input = pick.one(op.inNames);
    const output = pick.one(op.outNames);
    const extras = pick.some(["run", "tests", "palette", "name", "describe"] as const, pick.int(1, 2));
    const asks: string[] = [];
    const checks: Check<ScriptState>[] = [
      { name: `ports are ${input} in and ${output} out`, test: (s) => s.inputs.join() === input && s.outputs.join() === output },
      { name: "document is valid", test: (s) => s.valid },
      ...behaviourChecks(output, input, op.cases, op.ref)
    ];
    const example = op.cases[0];
    const testCount = pick.int(2, 3);
    const category = pick.one(["Text", "Math", "Utilities", "Data"]);
    for (const extra of extras) {
      if (extra === "run") {
        const expected = op.ref(example as never);
        asks.push(`Run it once with \`${input}\` = ${show(example)} to check it.`);
        checks.push({
          name: `last run gave ${output} = ${show(expected)}`,
          test: (s) => s.lastRun?.ok === true && same(s.lastRun.outputs?.[output], expected)
        });
      } else if (extra === "tests") {
        asks.push(`Save ${testCount} test cases and run them until they all pass.`);
        checks.push({
          name: `${testCount} saved tests pass`,
          test: (s) => s.tests.length >= testCount && s.lastTest?.ok === true && s.lastTest.passed >= testCount
        });
      } else if (extra === "palette") {
        asks.push(`Add it to my node menu under the category "${category}".`);
        checks.push({ name: `in the node menu under ${category}`, test: (s) => s.paletteCategory === category });
      } else if (extra === "name") {
        asks.push(`Name it "${op.title}".`);
        checks.push({ name: `named ${op.title}`, test: (s) => s.name === op.title });
      } else {
        asks.push("Give it a description that says what it does.");
        checks.push({ name: "has a description", test: (s) => s.description.trim().length > 0 });
      }
    }
    const opener = pick.one(["Write a JS script", "Make a script", "I need a JS script"]);
    const objective = `${opener} that takes ${TYPE_WORDS[op.inType]} on an input called \`${input}\` and sets an output called \`${output}\` to ${op.does(input)}. ${asks.join(" ")}`;
    return {
      objective,
      createBridge: () => scriptWorld({}, op.cases.map((value) => ({ [input]: value }))),
      checks,
      solve: async (call) => {
        await call("ui_jsscript_set_ports", {
          inputs: [{ name: input, type: op.inType }],
          outputs: [{ name: output, type: op.outType }]
        });
        await call("ui_jsscript_set_code", { code: op.body(input, output) });
        for (const extra of extras) {
          if (extra === "run") await call("ui_jsscript_run", { inputs: { [input]: example } });
          if (extra === "tests") {
            await call("ui_jsscript_set_tests", {
              tests: op.cases.slice(0, testCount).map((value, i) => ({
                name: `case ${i + 1}`,
                inputs: { [input]: value },
                expect: { [output]: op.ref(value as never) }
              }))
            });
            await call("ui_jsscript_test", {});
          }
          if (extra === "palette") await call("ui_jsscript_set_meta", { palette: { category } });
          if (extra === "name") await call("ui_jsscript_set_meta", { name: op.title });
          if (extra === "describe") await call("ui_jsscript_set_meta", { description: `Sets ${output} to ${op.does(input)}.` });
        }
      }
    };
  }
};

export const JSSCRIPT_FIX: TaskFamily<ScriptState> = {
  id: "jsscript-fix",
  surface: "jsscript",
  make(pick) {
    const op = pick.one(SCRIPT_OPS)(pick);
    const input = pick.one(op.inNames);
    const output = pick.one(op.outNames);
    const ports = { inputs: [{ name: input, type: op.inType }], outputs: [{ name: output, type: op.outType }] };
    const mode = pick.one(["repair", "extend", "rename"] as const);

    if (mode === "repair") {
      const saved = op.cases.slice(0, 2).map((value, i) => ({
        name: `${input} case ${i + 1}`,
        inputs: { [input]: value },
        expect: { [output]: op.ref(value as never) }
      }));
      return {
        objective: `This script should set \`${output}\` to ${op.does(input)}, but its saved tests fail. Run the tests, fix the body, and get them passing. Don't change the tests or the ports.`,
        createBridge: () =>
          scriptWorld(
            { name: op.title, document: { ...ports, code: op.bug(input, output), tests: saved } },
            op.cases.map((value) => ({ [input]: value }))
          ),
        checks: [
          { name: "saved tests kept", test: (s) => s.tests.join("|") === saved.map((t) => t.name).join("|") },
          { name: "ports unchanged", test: (s) => s.inputs.join() === input && s.outputs.join() === output },
          { name: "tests pass", test: (s) => s.lastTest?.ok === true },
          ...behaviourChecks(output, input, op.cases, op.ref)
        ],
        solve: async (call) => {
          await call("ui_jsscript_test", {});
          await call("ui_jsscript_set_code", { code: op.body(input, output) });
          await call("ui_jsscript_test", {});
        }
      };
    }

    if (mode === "extend") {
      const extra = EXTRA_OUTPUTS[op.inType]!;
      const added = pick.one(extra.names.filter((n) => n !== output && n !== input));
      return {
        objective: `This script sets \`${output}\` to ${op.does(input)}. Add a second output called \`${added}\` set to ${extra.does(input)}, and keep \`${output}\` working as it does now.`,
        createBridge: () =>
          scriptWorld(
            { name: op.title, document: { ...ports, code: op.body(input, output) } },
            op.cases.map((value) => ({ [input]: value }))
          ),
        checks: [
          { name: `input still ${input}`, test: (s) => s.inputs.join() === input },
          { name: `outputs are ${output} and ${added}`, test: (s) => [...s.outputs].sort().join() === [output, added].sort().join() },
          { name: "document is valid", test: (s) => s.valid },
          ...behaviourChecks(output, input, op.cases, op.ref),
          ...behaviourChecks(added, input, op.cases, extra.ref)
        ],
        solve: async (call) => {
          await call("ui_jsscript_set_ports", { outputs: [...ports.outputs, { name: added, type: extra.type }] });
          await call("ui_jsscript_set_code", { code: `${op.body(input, output)}\nawait output("${added}", ${extra.expr(input)});` });
        }
      };
    }

    const renamed = pick.one(op.inNames.filter((n) => n !== input && n !== output));
    return {
      objective: `Rename this script's input \`${input}\` to \`${renamed}\` and update the body to match. It should still set \`${output}\` to the same value as before.`,
      createBridge: () =>
        scriptWorld(
          { name: op.title, document: { ...ports, code: op.body(input, output) } },
          op.cases.map((value) => ({ [renamed]: value }))
        ),
      checks: [
        { name: `ports are ${renamed} in and ${output} out`, test: (s) => s.inputs.join() === renamed && s.outputs.join() === output },
        { name: "document is valid", test: (s) => s.valid },
        ...behaviourChecks(output, renamed, op.cases, op.ref)
      ],
      solve: async (call) => {
        await call("ui_jsscript_set_ports", { inputs: [{ name: renamed, type: op.inType }] });
        await call("ui_jsscript_set_code", { code: op.body(renamed, output) });
      }
    };
  }
};

// ---------------------------------------------------------------- apps

/** What kind of value a workflow port carries, and the widgets that fit it. */
interface PortKind {
  names: readonly string[];
  /** How the request names the widget or display. */
  ask: string;
  widgets: readonly string[];
}

const INPUT_KINDS: readonly PortKind[] = [
  { names: ["prompt", "topic", "question", "subject", "style", "caption"], ask: "a text field", widgets: ["TextInput"] },
  { names: ["count", "width", "steps", "seed", "duration"], ask: "a number field", widgets: ["NumberInput", "Slider"] },
  { names: ["upscale", "loop", "private", "draft"], ask: "an on/off switch", widgets: ["Switch"] },
  { names: ["photo", "reference", "source_image"], ask: "an image upload", widgets: ["ImageInput"] }
];

const OUTPUT_KINDS: readonly PortKind[] = [
  { names: ["answer", "summary", "story", "reply"], ask: "as text", widgets: ["Text", "Markdown"] },
  { names: ["image", "poster", "thumbnail", "artwork"], ask: "as an image", widgets: ["Image"] },
  { names: ["rows", "results", "matches"], ask: "as a table", widgets: ["Table"] },
  { names: ["voice", "narration", "track"], ask: "as an audio player", widgets: ["Audio"] },
  { names: ["clip", "video", "preview"], ask: "as a video", widgets: ["Video"] }
];

const APP_TITLES = [
  "Ask the AI", "Poster Maker", "Story Helper", "Voice Lab", "Data Peek",
  "Thumbnail Studio", "Quiz Builder", "Recipe Finder", "Clip Cutter", "Idea Board"
];
const BUTTON_LABELS = ["Generate", "Run", "Go", "Create", "Submit", "Make it"];
const PANEL_TITLES = ["Settings", "Inputs", "Options", "Details"];
const HEADINGS = ["Make something new", "Welcome", "Start here", "Your studio", "Try it out"];

const labelOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");
const APP_WORKFLOW_ID = "wf-app";
/**
 * Operation ids that run the task's workflow: the implicit `main` while the
 * app declares no operation, otherwise each declared one on that workflow.
 * The implicit operation disappears once any operation is declared.
 */
const workflowOps = (s: AppBridgeFinalState) =>
  s.operations.length === 0
    ? new Set(["main"])
    : new Set(s.operations.filter((o) => o.workflowId === APP_WORKFLOW_ID).map((o) => o.id));
/**
 * True when `c` is bound to `port` (`in:<node>` or `out:<node>`) through one
 * of `ops`, by default any operation on the task's workflow.
 */
const boundTo = (
  s: AppBridgeFinalState,
  c: AppComponentSummary | undefined,
  port: string,
  ops: ReadonlySet<string> = workflowOps(s)
) => {
  const match = /^op:([^/]+)\/(.+)$/.exec(typeof c?.props.binding === "string" ? c.props.binding : "");
  return match !== null && match[2] === port && ops.has(resolvedOp(s, match[1]!));
};
/**
 * The operation a binding's id addresses. As in app-runtime's resolver, `main`
 * names the app's one declared operation when that operation has another id.
 */
const resolvedOp = (s: AppBridgeFinalState, id: string) =>
  id === "main" && s.operations.length === 1 && s.operations[0]!.id !== "main" ? s.operations[0]!.id : id;
/** The operation `c`'s binding resolves to, if it binds one. */
const boundOp = (s: AppBridgeFinalState, c: AppComponentSummary | undefined) => {
  const match = /^op:([^/]+)\//.exec(typeof c?.props.binding === "string" ? c.props.binding : "");
  return match === null ? undefined : resolvedOp(s, match[1]!);
};
/**
 * Operations on the task's workflow that a click on `c` runs. A run event
 * with no operation id runs the app's first operation, as the runtime does.
 */
const clickRuns = (s: AppBridgeFinalState, c: AppComponentSummary): Set<string> => {
  const ops = workflowOps(s);
  const defaultOp = s.operations[0]?.id ?? "main";
  const events = Array.isArray(c.props.events) ? (c.props.events as Array<Record<string, unknown>>) : [];
  return new Set(
    events
      // A click fires in the change phase; a release-paced event waits for a
      // commit phase a button never reaches.
      .filter((e) => e.trigger === "click" && e.kind === "run" && e.pace !== "release")
      .map((e) => (typeof e.operationId === "string" ? e.operationId : defaultOp))
      .filter((id) => ops.has(id))
  );
};

/** True when `op` feeds input `nodeId` from its bound widget, the default when it maps nothing. */
const takesWidgetValue = (s: AppBridgeFinalState, op: string, nodeId: string) => {
  const mapping = s.operations.find((o) => o.id === op)?.inputs[nodeId];
  return mapping === undefined || mapping.from === "widget";
};
const runsWorkflow = (s: AppBridgeFinalState, c: AppComponentSummary) => clickRuns(s, c).size > 0;
const parentOf = (s: AppBridgeFinalState, c: AppComponentSummary) => s.components.find((p) => p.id === c.parentId);

export const APP_BUILD: TaskFamily<AppBridgeFinalState> = {
  id: "app-build",
  surface: "app",
  make(pick) {
    const pickPorts = (kinds: readonly PortKind[], count: number, prefix: string) => {
      const used = new Set<string>();
      return pick.some(kinds, count).map((kind, i) => {
        const name = pick.one(kind.names.filter((n) => !used.has(n)));
        used.add(name);
        return { kind, name, nodeId: `${prefix}-${i + 1}`, label: labelOf(name) };
      });
    };
    const ins = pickPorts(INPUT_KINDS, pick.int(1, 3), "in");
    const outs = pickPorts(OUTPUT_KINDS, pick.int(1, 2), "out");
    const workflow = {
      inputs: ins.map((p) => ({ nodeId: p.nodeId, name: p.name, label: p.label })),
      outputs: outs.map((p) => ({ nodeId: p.nodeId, name: p.name, label: p.label })),
      variables: []
    };
    const title = pick.one(APP_TITLES);
    const heading = pick.chance(0.5) ? pick.one(HEADINGS) : null;
    const button = pick.one(BUTTON_LABELS);
    const layout = pick.one(["flat", "panel", "columns"] as const);
    const panelTitle = pick.one(PANEL_TITLES);

    const inToken = (p: (typeof ins)[number]) => `in:${p.nodeId}`;
    const outToken = (p: (typeof outs)[number]) => `out:${p.nodeId}`;
    const fits = (c: AppComponentSummary, kind: PortKind) => kind.widgets.includes(c.type);
    const placedIn = (s: AppBridgeFinalState, c: AppComponentSummary, side: "controls" | "results") => {
      if (layout === "flat") return true;
      const parent = parentOf(s, c);
      if (layout === "panel") return side === "results" || (parent?.type === "Container" && c.slot === "content" && parent.props.title === panelTitle);
      return parent?.type === "Columns" && c.slot === (side === "controls" ? "left" : "right");
    };

    // The runtime reads inputs and publishes outputs per operation, so every
    // widget must go through one operation that one requested button runs. A
    // field bound to another operation never reaches that run.
    const portOk = (s: AppBridgeFinalState, p: (typeof ins)[number] | (typeof outs)[number], side: "controls" | "results", op: string) =>
      (side === "results" || takesWidgetValue(s, op, p.nodeId)) &&
      s.components.some(
        (c) =>
          boundTo(s, c, side === "controls" ? inToken(p as (typeof ins)[number]) : outToken(p as (typeof outs)[number]), new Set([op])) &&
          fits(c, p.kind) &&
          placedIn(s, c, side)
      );
    const runOps = (s: AppBridgeFinalState): string[] => [
      ...new Set(
        s.components
          .filter((c) => c.type === "Button" && c.props.label === button && placedIn(s, c, "controls"))
          .flatMap((c) => [...clickRuns(s, c)])
      )
    ];
    /** The operation one requested button runs that every widget goes through, if any. */
    const completeOp = (s: AppBridgeFinalState): string | undefined =>
      runOps(s).find(
        (op) => ins.every((p) => portOk(s, p, "controls", op)) && outs.every((p) => portOk(s, p, "results", op))
      );
    /** The operations a binding check may count: the one run that wires everything when there is one. */
    const countedOps = (s: AppBridgeFinalState): Set<string> => {
      const complete = completeOp(s);
      if (complete !== undefined) return new Set([complete]);
      const candidates = runOps(s);
      return candidates.length > 0 ? new Set(candidates) : workflowOps(s);
    };
    const widgetsBoundTo = (s: AppBridgeFinalState, port: string) => {
      const ops = countedOps(s);
      return s.components.filter((c) => boundTo(s, c, port, ops));
    };

    const checks: Check<AppBridgeFinalState>[] = [
      { name: `title is ${title}`, test: (s) => s.title === title },
      ...ins.map((p) => ({
        name: `${p.kind.widgets.join("/")} bound to ${p.name}`,
        test: (s: AppBridgeFinalState) => widgetsBoundTo(s, inToken(p)).some((c) => fits(c, p.kind) && placedIn(s, c, "controls"))
      })),
      ...outs.map((p) => ({
        name: `${p.kind.widgets.join("/")} shows ${p.name}`,
        test: (s: AppBridgeFinalState) => widgetsBoundTo(s, outToken(p)).some((c) => fits(c, p.kind) && placedIn(s, c, "results"))
      })),
      {
        name: `${button} button runs the workflow`,
        test: (s) => s.components.some((c) => c.type === "Button" && c.props.label === button && runsWorkflow(s, c) && placedIn(s, c, "controls"))
      },
      { name: `one ${button} run takes the inputs and shows the outputs`, test: (s) => completeOp(s) !== undefined }
    ];
    if (heading) checks.push({ name: `heading ${heading}`, test: (s) => s.components.some((c) => c.type === "Heading" && c.props.text === heading) });

    const inAsks = ins.map((p) => `${p.kind.ask} for the ${p.name} input`);
    const outAsks = outs.map((p) => `the ${p.name} output ${p.kind.ask}`);
    const layoutAsk =
      layout === "panel"
        ? ` Put the input fields and the button inside a Panel titled "${panelTitle}".`
        : layout === "columns"
          ? " Use two columns: the input fields and the button on the left, the results on the right."
          : "";
    const objective =
      `Build an app on the loaded workflow. Title it "${title}"${heading ? `, add a heading that says "${heading}"` : ""}, ` +
      `add ${list(inAsks)}, a "${button}" button that runs the workflow, and show ${list(outAsks)}.${layoutAsk}`;

    return {
      objective,
      createBridge: () => createAppToolBridge({ workflowId: APP_WORKFLOW_ID, workflow, onlyLoadedWorkflows: true }),
      checks,
      solve: async (call) => {
        const app = { application_id: "app-eval" };
        const targets = (await call("ui_app_get_binding_targets", app)) as {
          operations: Array<{ inputs: Array<{ nodeId: string; binding: string }>; outputs: Array<{ nodeId: string; binding: string }> }>;
        };
        const op = targets.operations[0]!;
        await call("ui_app_set_title", { ...app, title });
        if (heading) await call("ui_app_add_component", { ...app, type: "Heading", props: { text: heading } });
        let controls: Record<string, unknown> = {};
        let results: Record<string, unknown> = {};
        if (layout === "panel") {
          const panel = (await call("ui_app_add_component", { ...app, type: "Container", props: { title: panelTitle } })) as { component: { id: string } };
          controls = { parent_id: panel.component.id, slot: "content" };
        } else if (layout === "columns") {
          const columns = (await call("ui_app_add_component", { ...app, type: "Columns" })) as { component: { id: string } };
          controls = { parent_id: columns.component.id, slot: "left" };
          results = { parent_id: columns.component.id, slot: "right" };
        }
        for (const p of ins) {
          const binding = op.inputs.find((t) => t.nodeId === p.nodeId)!.binding;
          await call("ui_app_add_component", { ...app, ...controls, type: p.kind.widgets[0], props: { label: p.label, binding } });
        }
        await call("ui_app_add_component", {
          ...app,
          ...controls,
          type: "Button",
          props: { label: button, events: [{ trigger: "click", kind: "run", operationId: "main" }] }
        });
        for (const p of outs) {
          const binding = op.outputs.find((t) => t.nodeId === p.nodeId)!.binding;
          await call("ui_app_add_component", { ...app, ...results, type: p.kind.widgets[0], props: { label: p.label, binding } });
        }
      }
    };
  }
};

interface SeedWidget {
  seed: SeedComponent & { id: string };
  /** How the request describes it. */
  says: string;
}

export const APP_EDIT: TaskFamily<AppBridgeFinalState> = {
  id: "app-edit",
  surface: "app",
  make(pick) {
    const title = pick.one(APP_TITLES);
    const headingText = pick.one(HEADINGS);
    const buttonLabel = pick.one(BUTTON_LABELS);
    const panelTitle = pick.one(PANEL_TITLES);
    const promptName = pick.one(INPUT_KINDS[0]!.names);
    const optional: SeedWidget[] = [
      { seed: { type: "Text", id: "text-1", props: { text: "Old note" } }, says: `a Text widget saying "Old note"` },
      { seed: { type: "Container", id: "panel-1", props: { title: panelTitle } }, says: `an empty Panel titled "${panelTitle}"` },
      { seed: { type: "TextInput", id: "input-1", props: { label: labelOf(promptName) } }, says: `an unbound text field labeled "${labelOf(promptName)}"` },
      { seed: { type: "Switch", id: "switch-1", props: { label: "Dark mode" } }, says: `a Switch labeled "Dark mode"` },
      { seed: { type: "Image", id: "image-1", props: { label: "Preview" } }, says: `an Image labeled "Preview"` }
    ];
    const widgets: SeedWidget[] = [
      { seed: { type: "Heading", id: "heading-1", props: { text: headingText } }, says: `a heading "${headingText}"` },
      { seed: { type: "Button", id: "btn-1", props: { label: buttonLabel } }, says: `a "${buttonLabel}" button` },
      ...pick.some(optional, pick.int(2, 3))
    ];
    const has = (id: string) => widgets.some((w) => w.seed.id === id);
    const byId = (s: AppBridgeFinalState, id: string) => s.components.find((c) => c.id === id);

    const workflow = {
      inputs: [
        { nodeId: "in-1", name: promptName, label: labelOf(promptName) },
        { nodeId: "in-2", name: "negative", label: "Negative" }
      ],
      outputs: [{ nodeId: "out-1", name: "image", label: "Image" }],
      variables: []
    };

    type Op = { touches: string; ask: string; check: Check<AppBridgeFinalState>; step: (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) => Promise<void> };
    const app = { application_id: "app-eval" };
    const candidates: Array<() => Op> = [
      () => {
        const next = pick.one(APP_TITLES.filter((t) => t !== title));
        return {
          touches: "title",
          ask: `rename the app to "${next}"`,
          check: { name: `title is ${next}`, test: (s) => s.title === next },
          step: async (call) => void (await call("ui_app_set_title", { ...app, title: next }))
        };
      },
      () => {
        const next = pick.one(BUTTON_LABELS.filter((l) => l !== buttonLabel));
        return {
          touches: "btn-1",
          ask: `relabel the "${buttonLabel}" button to "${next}"`,
          check: { name: `button says ${next}`, test: (s) => byId(s, "btn-1")?.props.label === next },
          step: async (call) => void (await call("ui_app_update_component", { ...app, id: "btn-1", props: { label: next } }))
        };
      },
      () => {
        const next = pick.one(HEADINGS.filter((h) => h !== headingText));
        return {
          touches: "heading-1",
          ask: `change the heading to "${next}"`,
          check: { name: `heading says ${next}`, test: (s) => byId(s, "heading-1")?.props.text === next },
          step: async (call) => void (await call("ui_app_update_component", { ...app, id: "heading-1", props: { text: next } }))
        };
      },
      ...(has("text-1")
        ? [() => ({
            touches: "text-1",
            ask: `remove the "Old note" text`,
            check: { name: "text removed", test: (s: AppBridgeFinalState) => !byId(s, "text-1") },
            step: async (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) => void (await call("ui_app_remove_component", { ...app, id: "text-1" }))
          })]
        : []),
      ...(has("image-1")
        ? [() => ({
            touches: "image-1",
            ask: "bind the Preview image to the workflow's image output",
            check: { name: "image bound to out-1", test: (s: AppBridgeFinalState) => boundTo(s, byId(s, "image-1"), "out:out-1") },
            step: async (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) =>
              void (await call("ui_app_update_component", { ...app, id: "image-1", props: { binding: "op:main/out:out-1" } }))
          })]
        : []),
      ...(has("panel-1")
        ? [() => {
            const text = pick.one(["Pick a style first", "Results show below", "Takes about a minute", "Uses your credits"]);
            return {
              touches: "panel-1",
              ask: `add a Text widget saying "${text}" inside the "${panelTitle}" panel`,
              check: {
                name: `text "${text}" in the panel`,
                test: (s: AppBridgeFinalState) =>
                  s.components.some((c) => c.type === "Text" && c.props.text === text && c.parentId === "panel-1" && c.slot === "content")
              },
              step: async (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) =>
                void (await call("ui_app_add_component", { ...app, type: "Text", props: { text }, parent_id: "panel-1", slot: "content" }))
            };
          }]
        : []),
      ...(has("input-1")
        ? [() => ({
            touches: "input-1",
            ask: `bind the ${labelOf(promptName)} text field to the workflow's ${promptName} input`,
            check: {
              name: `input bound to ${promptName}`,
              test: (s: AppBridgeFinalState) => {
                const op = boundOp(s, byId(s, "input-1"));
                return boundTo(s, byId(s, "input-1"), "in:in-1") && op !== undefined && takesWidgetValue(s, op, "in-1");
              }
            },
            step: async (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) =>
              void (await call("ui_app_update_component", { ...app, id: "input-1", props: { binding: "op:main/in:in-1" } }))
          })]
        : []),
      ...(has("switch-1")
        ? [() => {
            const id = pick.one(["dark_mode", "night_theme", "use_dark"]);
            return {
              touches: "switch-1",
              ask: `bind the Dark mode switch to a new user-scoped variable with id "${id}" that persists across sessions`,
              check: {
                name: `switch bound to persisted user variable ${id}`,
                test: (s: AppBridgeFinalState) =>
                  s.variables.some((v) => v.id === id && v.scope === "user" && v.persist === true) &&
                  byId(s, "switch-1")?.props.binding === `var:${id}`
              },
              step: async (call: (n: string, a: Record<string, unknown>) => Promise<unknown>) => {
                await call("ui_app_declare_variable", { ...app, id, name: "Dark mode", type: { type: "bool" }, default: false, scope: "user", persist: true });
                await call("ui_app_update_component", { ...app, id: "switch-1", props: { binding: `var:${id}` } });
              }
            };
          }]
        : [])
    ];
    const ops = pick.some(candidates, pick.int(2, 3)).map((make) => make());
    const touched = new Set(ops.map((o) => o.touches));
    const checks: Check<AppBridgeFinalState>[] = ops.map((o) => o.check);
    if (!touched.has("title")) checks.push({ name: "title unchanged", test: (s) => s.title === title });
    for (const w of widgets.filter((w) => !touched.has(w.seed.id))) {
      const props = JSON.stringify({ ...w.seed.props, id: w.seed.id });
      checks.push({ name: `${w.seed.id} left alone`, test: (s) => JSON.stringify(byId(s, w.seed.id)?.props ?? null) === props });
    }
    const objective = `The open app "${title}" has ${list(widgets.map((w) => w.says))}. Please ${list(ops.map((o) => o.ask))}. Leave everything else as it is.`;
    return {
      objective,
      createBridge: () => createAppToolBridge({ title, workflowId: APP_WORKFLOW_ID, workflow, onlyLoadedWorkflows: true, components: widgets.map((w) => w.seed) }),
      checks,
      solve: async (call) => {
        for (const op of ops) await op.step(call);
      }
    };
  }
};

export const JSSCRIPT_APP_FAMILIES: readonly ErasedFamily[] = [
  defineFamily(JSSCRIPT_WRITE),
  defineFamily(JSSCRIPT_FIX),
  defineFamily(APP_BUILD),
  defineFamily(APP_EDIT)
];
