/**
 * The CodeAct half of the chat system prompt: the action contract, the import
 * rule, the object model, the document guidance and the sandbox API. These pin
 * the short forms, the rules the eval traces show the student needs (wrong
 * module imports, undefined names, syntax errors, reserved names), and the
 * cache invariant that the system section does not depend on the turn.
 */
import { describe, it, expect } from "vitest";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import {
  NODETOOL_API_NAMESPACE_TOOLS,
  NODETOOL_FOCUS_NAMESPACES,
  buildNodetoolApiPromptSection,
  renderNodetoolNamespaceLine
} from "../src/codeact/nodetool-api.js";
import {
  TOOL_CATALOG_GUIDANCE,
  buildCodeActSystemPrompt
} from "../src/codeact/prompt.js";
import { RESERVED_BINDINGS_SENTENCE } from "../src/codeact/tool-api.js";
import { getSandboxManifest } from "../src/code-gen/sandbox-manifest.js";

const tool = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

const EDITOR_TOOLS = [
  ...Array.from({ length: 12 }, (_, i) => `ui_timeline_op${i}`),
  ...Array.from({ length: 8 }, (_, i) => `ui_sketch_op${i}`),
  "ui_copy"
];

/** A chat belt big enough to defer, with every namespace lit. */
const BELT = [
  ...Object.values(NODETOOL_API_NAMESPACE_TOOLS).flat(),
  "load_skill",
  "list_skills",
  "run_search",
  "ui_open_document",
  ...EDITOR_TOOLS
].map(tool);

const session = (turnToolNames: string[]) =>
  createChatCodeActSession({
    tools: BELT,
    includeProductKnowledge: false,
    executeTool: async () => null,
    residentToolNames: ["run_search", "ui_open_document"],
    turnToolNames
  });

const occurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

describe("chat CodeAct system section", () => {
  it("is byte-identical whatever the turn focuses", () => {
    const none = session([]).systemPromptSection;
    const timeline = session(EDITOR_TOOLS.filter((n) => n.startsWith("ui_timeline_")));
    const sketch = session(EDITOR_TOOLS.filter((n) => n.startsWith("ui_sketch_")));
    expect(timeline.systemPromptSection).toBe(none);
    expect(sketch.systemPromptSection).toBe(none);
    // The focused detail goes to the turn block instead.
    expect(timeline.turnPromptSection).toContain("ui_timeline_op0");
  });

  it("states the import rule once, next to the import lines", () => {
    const system = session([]).systemPromptSection;
    expect(occurrences(system, TOOL_CATALOG_GUIDANCE)).toBe(1);
    expect(occurrences(system, "`tools.<name>()`")).toBe(1);
    const tools = system.indexOf("# Tools\n");
    expect(system.indexOf(TOOL_CATALOG_GUIDANCE)).toBe(tools + "# Tools\n".length);
    expect(system.indexOf("import { run_search }")).toBeGreaterThan(tools);
  });

  it("names the import mistakes the eval traces show", () => {
    // `await import(...)`, `import { nodetool } from ...`, and a ui_* name
    // called without its import line.
    expect(TOOL_CATALOG_GUIDANCE).toContain("dynamic import");
    expect(TOOL_CATALOG_GUIDANCE).toContain("`nodetool` is a global");
    expect(TOOL_CATALOG_GUIDANCE).toContain("Each capability is an import");
  });
});

describe("action contract", () => {
  const chat = buildCodeActSystemPrompt({ tools: [], variant: "chat" });
  const contract = chat.slice(
    chat.indexOf("# CodeAct Execution"),
    chat.indexOf("# Answering the user")
  );

  it("keeps the rules aimed at the student's errors", () => {
    expect(contract).toContain("Nothing carries over between actions.");
    expect(contract).toContain("console.log(JSON.stringify(x))");
    expect(contract).toContain("before you extract fields");
    expect(contract).toContain("A failed call throws.");
    expect(contract).toContain(RESERVED_BINDINGS_SENTENCE);
    expect(contract).toContain("Write plain JavaScript, not TypeScript.");
  });

  it("states title, risk and description in one short rule", () => {
    const rule = contract
      .split("\n- ")
      .find((bullet) => bullet.startsWith("Each call carries a `title`"));
    expect(rule).toBeDefined();
    expect(rule).toContain('"high"');
    expect(rule).toContain("`description`");
    expect(rule).toContain('`""`');
    expect(rule!.length).toBeLessThan(420);
  });
});

describe("sandbox API", () => {
  const manifest = getSandboxManifest();
  const sandboxOf = (variant: "chat" | "step") => {
    const prompt = buildCodeActSystemPrompt({ tools: [], variant });
    return prompt.slice(prompt.indexOf("# Sandbox API"));
  };

  it("names the chat bridges on one line, without signatures", () => {
    const chat = sandboxOf("chat");
    const line = chat.split("\n").find((l) => l.startsWith("Bridges, awaited:"));
    expect(line).toBeDefined();
    expect(line).toContain("`crypto.digest/hmac`");
    expect(line).toContain("`format.number/date/relativeTime/list`");
    expect(line).toContain("Not awaited: `console.log/warn/error/info`");
    expect(chat).not.toContain(" -> ");
    for (const member of manifest.bridges.crypto.members) {
      expect(chat).not.toContain(member.signature);
    }
  });

  it("keeps the list of what is not available", () => {
    const chat = sandboxOf("chat");
    const line = chat.split("\n").find((l) => l.startsWith("Not available:"));
    expect(line).toBe(`Not available: ${manifest.blockedGlobals.join(", ")}.`);
  });

  it("keeps signatures for the step variant", () => {
    const step = sandboxOf("step");
    for (const member of manifest.bridges.crypto.members) {
      expect(step).toContain(member.signature);
    }
  });
});

describe("nodetool object model", () => {
  const names = [...BELT.map((t) => t.name)];
  const section = buildNodetoolApiPromptSection(names);

  it("gives each namespace one line", () => {
    const lines = section.split("\n").filter((l) => l.startsWith("- `nodetool."));
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) {
      expect(line).toMatch(/^- `nodetool\.\w+`: .+\.$/);
    }
    // No line runs onto a second one.
    const body = section.slice(section.indexOf("- `nodetool."));
    const list = body.slice(0, body.indexOf("\n\n"));
    expect(list.split("\n").every((l) => l.startsWith("- `nodetool."))).toBe(true);
  });

  it("keeps full entries out of the system section", () => {
    expect(section).not.toContain("previewDesign({storyboardId");
  });

  it("maps every focus type with a namespace to a renderable line", () => {
    for (const [focus, namespace] of Object.entries(NODETOOL_FOCUS_NAMESPACES)) {
      expect(renderNodetoolNamespaceLine(namespace, names), focus).not.toBe("");
    }
  });

  it("keeps the document guidance short and pointed at the server-side edit", () => {
    const start = section.indexOf("# Editing documents");
    expect(start).toBeGreaterThan(0);
    const guidance = section.slice(start);
    expect(guidance).toContain("`nodetool.<namespace>.edit(id, ops)`");
    expect(guidance).toContain("`ui_timeline_run_command`");
    expect(guidance.length).toBeLessThan(800);
  });
});
