/**
 * The Spec stage gate: the schema is the cheap half, the catalog check is the
 * half that matters. Both run before a planning token is spent, and a spec that
 * cannot be pinned fails rather than being guessed at.
 */

import { describe, it, expect, vi } from "vitest";
import { AgentMemory, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  parseBuildSpec,
  runSpecStage,
  validateBuildSpec
} from "../src/app-build/spec.js";
import type { BuildSpec } from "../src/app-build/types.js";

function scriptedProvider(results: unknown[]): BaseProvider {
  let turn = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    generateMessages: async function* () {
      const result = results[Math.min(turn, results.length - 1)];
      turn++;
      yield { id: `tc_${turn}`, name: "finish_step", args: { result } };
    },
    async *generateMessagesTraced(args: unknown) {
      yield* (
        this as unknown as {
          generateMessages: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateMessages(args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as unknown as {
          generateLoop: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateLoop.call(this, args);
    },
    _admitTurn: () => true,
    generateMessage: vi.fn(),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false
  } as unknown as BaseProvider;
}

function makeContext(): ProcessingContext {
  return {
    memory: new AgentMemory(),
    workspaceDir: null,
    storeStepResult: vi.fn(async (key: string) => key),
    loadStepResult: vi.fn(),
    set: vi.fn(),
    get: vi.fn()
  } as unknown as ProcessingContext;
}

function validSpec(): BuildSpec {
  return {
    title: "Drafter",
    operations: [
      {
        id: "draft",
        objective: "Draft a short note from a prompt",
        inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
        outputs: [{ name: "text", type: "string" }],
        streaming: false
      }
    ],
    variables: [],
    widgets: [
      {
        role: "prompt-input",
        type: "TextInput",
        binding: "op:draft/in:prompt",
        label: "Prompt"
      },
      { role: "run-button", type: "Button", binding: "", label: "Draft it" },
      {
        role: "draft-output",
        type: "Markdown",
        binding: "op:draft/out:text",
        label: "Draft"
      }
    ],
    interactions: [
      {
        name: "draft-once",
        steps: [
          { set: { key: "prompt", value: "a haiku", operationId: "draft" } },
          { click: "run-button" }
        ],
        expect: [{ widget: "draft-output", check: "nonEmpty" }]
      }
    ]
  };
}

describe("validateBuildSpec", () => {
  it("accepts a spec whose every reference resolves", () => {
    expect(validateBuildSpec(validSpec())).toEqual([]);
  });

  it("rejects a widget type the catalog does not have", () => {
    const spec = validSpec();
    spec.widgets[2]!.type = "FancyMarkdownPane";
    const codes = validateBuildSpec(spec).map((i) => i.code);
    expect(codes).toContain("unknown_widget_type");
  });

  it("rejects a binding that names an input no operation declares", () => {
    const spec = validSpec();
    spec.widgets[0]!.binding = "op:draft/in:topic";
    const issues = validateBuildSpec(spec);
    expect(issues[0]?.code).toBe("unknown_operation_input");
    expect(issues[0]?.operation).toBe("draft");
  });

  it("rejects a binding token that does not parse", () => {
    const spec = validSpec();
    spec.widgets[0]!.binding = "the prompt";
    expect(validateBuildSpec(spec).map((i) => i.code)).toContain(
      "unparsable_binding"
    );
  });

  it("rejects a variable written by an undeclared operation", () => {
    const spec = validSpec();
    spec.variables = [
      {
        id: "last_draft",
        scope: "app",
        persist: true,
        writtenBy: "polish",
        readBy: ["draft-output"]
      }
    ];
    expect(validateBuildSpec(spec).map((i) => i.code)).toContain(
      "unknown_variable_writer"
    );
  });

  it("rejects an interaction that clicks a widget nobody placed", () => {
    const spec = validSpec();
    spec.interactions[0]!.steps[1] = { click: "submit-button" };
    expect(validateBuildSpec(spec).map((i) => i.code)).toContain(
      "interaction_widget_unknown"
    );
  });

  it("rejects an expectation on a widget that shows nothing", () => {
    const spec = validSpec();
    spec.interactions[0]!.expect = [
      { widget: "run-button", check: "nonEmpty" }
    ];
    expect(validateBuildSpec(spec).map((i) => i.code)).toContain(
      "expect_widget_not_display"
    );
  });

  it("rejects an operation no interaction exercises", () => {
    const spec = validSpec();
    spec.operations.push({
      id: "polish",
      objective: "Polish the draft",
      inputs: [{ name: "text", type: "string", example: "hi" }],
      outputs: [{ name: "polished", type: "string" }],
      streaming: false
    });
    const issue = validateBuildSpec(spec).find(
      (i) => i.code === "operation_without_interaction"
    );
    expect(issue?.operation).toBe("polish");
  });
});

describe("parseBuildSpec", () => {
  it("reports a schema violation without running the catalog checks", () => {
    const { spec, issues } = parseBuildSpec({ title: "no operations" });
    expect(spec).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("schema_violation");
  });
});

describe("runSpecStage", () => {
  it("bounces a schema-valid but catalog-invalid spec, then accepts the fix", async () => {
    const broken = validSpec();
    broken.widgets[2]!.type = "FancyMarkdownPane";

    const result = await runSpecStage({
      prompt: "an app that drafts a note",
      provider: scriptedProvider([broken, validSpec()]),
      model: "m",
      context: makeContext()
    });

    expect(result.record.status).toBe("ok");
    expect(result.spec?.title).toBe("Drafter");
  });

  it("fails with the validation record when the spec never validates", async () => {
    const broken = validSpec();
    broken.widgets[0]!.binding = "op:draft/in:topic";

    const result = await runSpecStage({
      prompt: "an app that drafts a note",
      provider: scriptedProvider([broken]),
      model: "m",
      context: makeContext()
    });

    expect(result.spec).toBeNull();
    expect(result.record.status).toBe("failed");
    expect(result.record.issues.map((i) => i.code)).toEqual([
      "unknown_operation_input"
    ]);
    expect(result.record.detail).toContain("3 attempts");
  });
});
