/**
 * Interaction completion adds what a run needs and touches nothing the spec
 * authored.
 */

import { describe, it, expect } from "vitest";
import { completeInteractions } from "../src/app-build/interactions.js";
import type { BuildSpec } from "../src/app-build/types.js";

function spec(): BuildSpec {
  return {
    title: "Drafter",
    operations: [
      {
        id: "draft",
        objective: "Draft a note",
        inputs: [
          { name: "prompt", type: "string", example: "a haiku" },
          { name: "tone", type: "string", example: "terse" }
        ],
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
          { change: "prompt-input", value: "a haiku about rain" },
          { click: "run-button" }
        ],
        expect: [{ widget: "draft-output", check: "nonEmpty" }]
      }
    ]
  };
}

describe("completeInteractions", () => {
  it("seeds only the inputs no authored step touches", () => {
    const [interaction] = completeInteractions(spec());

    expect(interaction?.derived).toBe(false);
    expect(interaction?.addedSteps).toEqual(["set tone"]);
    expect(interaction?.steps).toEqual([
      { set: { key: "tone", value: "terse", operationId: "draft" } },
      { change: "prompt-input", value: "a haiku about rain" },
      { click: "run-button" }
    ]);
  });

  it("leaves an interaction that supplies every input alone", () => {
    const source = spec();
    source.interactions[0]!.steps = [
      { set: { key: "prompt", value: "x", operationId: "draft" } },
      { set: { key: "tone", value: "wry", operationId: "draft" } },
      { click: "run-button" }
    ];
    const authored = [...source.interactions[0]!.steps];

    const [interaction] = completeInteractions(source);

    expect(interaction?.addedSteps).toEqual([]);
    expect(interaction?.steps).toEqual(authored);
  });

  it("derives a run for an operation the spec forgot", () => {
    const source = spec();
    source.operations.push({
      id: "polish",
      objective: "Polish the draft",
      inputs: [{ name: "text", type: "string", example: "a draft" }],
      outputs: [{ name: "polished", type: "string" }],
      streaming: false
    });
    source.widgets.push({
      role: "polished-output",
      type: "Markdown",
      binding: "op:polish/out:polished",
      label: "Polished"
    });

    const completed = completeInteractions(source);

    expect(completed).toHaveLength(2);
    const derived = completed[1];
    expect(derived?.derived).toBe(true);
    expect(derived?.operationId).toBe("polish");
    expect(derived?.name).toBe("polish-default");
    expect(derived?.steps).toEqual([
      { set: { key: "text", value: "a draft", operationId: "polish" } },
      { run: "polish" }
    ]);
    expect(derived?.expect).toEqual([
      { widget: "polished-output", check: "nonEmpty" }
    ]);
  });

  it("derives nothing for an operation an interaction already runs", () => {
    const source = spec();
    source.interactions[0]!.steps = [{ run: "draft" }];

    const completed = completeInteractions(source);

    expect(completed).toHaveLength(1);
    expect(completed[0]?.derived).toBe(false);
  });
});
