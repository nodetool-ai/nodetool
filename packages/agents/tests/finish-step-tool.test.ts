import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { FinishStepTool } from "../src/tools/finish-step-tool.js";
import { Tool } from "../src/tools/base-tool.js";

// Minimal concrete subclass of Tool for testing base class behavior
class StubTool extends Tool {
  readonly name = "stub_tool";
  readonly description = "A stub tool for testing";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: { foo: { type: "string" } }
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return params;
  }
}

const fakeContext = {} as ProcessingContext;

describe("FinishStepTool", () => {
  describe("name and description", () => {
    it("has name 'finish_step'", () => {
      const tool = new FinishStepTool();
      expect(tool.name).toBe("finish_step");
    });

    it("has a non-empty description", () => {
      const tool = new FinishStepTool();
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });

  describe("default schema (no outputSchema)", () => {
    it("wraps a string result in the inputSchema", () => {
      const tool = new FinishStepTool();
      expect(tool.inputSchema).toEqual({
        type: "object",
        properties: {
          result: {
            type: "string",
            description: "The result of the step."
          }
        },
        required: ["result"],
        additionalProperties: false
      });
    });
  });

  describe("custom outputSchema", () => {
    it("wraps the provided schema with additionalProperties:false on an object type", () => {
      const outputSchema = {
        type: "object",
        properties: {
          answer: { type: "number" }
        },
        required: ["answer"]
      };
      const tool = new FinishStepTool(outputSchema);

      expect(tool.inputSchema).toEqual({
        type: "object",
        properties: {
          result: {
            type: "object",
            properties: {
              answer: { type: "number" }
            },
            required: ["answer"],
            additionalProperties: false
          }
        },
        required: ["result"],
        additionalProperties: false
      });
    });

    it("does not overwrite existing additionalProperties on a custom schema", () => {
      const outputSchema = {
        type: "object",
        properties: { x: { type: "string" } },
        additionalProperties: true
      };
      const tool = new FinishStepTool(outputSchema);

      const result = (tool.inputSchema as any).properties.result;
      expect(result.additionalProperties).toBe(true);
    });

    it("does not add additionalProperties to non-object type schemas", () => {
      const outputSchema = {
        type: "array",
        items: { type: "string" }
      };
      const tool = new FinishStepTool(outputSchema);

      const result = (tool.inputSchema as any).properties.result;
      expect(result).toEqual({
        type: "object",
        description: "Result wrapper",
        properties: {
          items: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["items"],
        additionalProperties: false
      });
      expect(result.additionalProperties).toBe(false);
    });

    it("does not mutate the original outputSchema", () => {
      const outputSchema = {
        type: "object",
        properties: { a: { type: "string" } }
      };
      const original = { ...outputSchema };
      new FinishStepTool(outputSchema);
      expect(outputSchema).toEqual(original);
    });
  });

  describe("process()", () => {
    it("returns params as-is", async () => {
      const tool = new FinishStepTool();
      const params = { result: "hello world" };
      const output = await tool.process(fakeContext, params);
      expect(output).toEqual(params);
    });
  });

  describe("userMessage()", () => {
    it("returns the expected completion string", () => {
      const tool = new FinishStepTool();
      expect(tool.userMessage({})).toBe("Completing step with result...");
    });
  });

  describe("toProviderTool()", () => {
    it("returns the correct shape for LLM function calling", () => {
      const tool = new FinishStepTool();
      const providerTool = tool.toProviderTool();

      expect(providerTool.name).toBe("finish_step");
      expect(providerTool.description).toBe(tool.description);
      const schema = providerTool.inputSchema as Record<string, unknown>;
      expect(schema["type"]).toBe("object");
      expect(schema["required"]).toEqual(["result"]);
      const properties = schema["properties"] as Record<string, unknown>;
      expect(properties["result"]).toEqual({
        type: "string",
        description: "The result of the step."
      });
      // _message field is injected by the base class for user-facing status.
      expect(properties["_message"]).toMatchObject({ type: "string" });
    });
  });
});

describe("Tool (base class)", () => {
  describe("toProviderTool()", () => {
    it("returns {name, description, inputSchema} with _message injected", () => {
      const tool = new StubTool();
      const providerTool = tool.toProviderTool();

      expect(providerTool.name).toBe("stub_tool");
      expect(providerTool.description).toBe("A stub tool for testing");
      const schema = providerTool.inputSchema as Record<string, unknown>;
      expect(schema["type"]).toBe("object");
      const properties = schema["properties"] as Record<string, unknown>;
      expect(properties["foo"]).toEqual({ type: "string" });
      expect(properties["_message"]).toMatchObject({ type: "string" });
    });
  });

  describe("userMessage()", () => {
    it("returns 'Running {name}' by default", () => {
      const tool = new StubTool();
      expect(tool.userMessage({})).toBe("Running stub_tool");
    });

    it("prefers an LLM-authored _message arg over the default", () => {
      const tool = new StubTool();
      expect(tool.userMessage({ _message: "Doing the thing" })).toBe(
        "Doing the thing"
      );
    });
  });

  describe("stripMessage() / extractMessage()", () => {
    it("extracts a trimmed _message string and strips it from args", () => {
      const args = { foo: "bar", _message: "  Status text  " };
      expect(Tool.extractMessage(args)).toBe("Status text");
      expect(Tool.stripMessage(args)).toEqual({ foo: "bar" });
    });

    it("ignores empty or non-string _message", () => {
      expect(Tool.extractMessage({ _message: "" })).toBeNull();
      expect(Tool.extractMessage({ _message: 42 })).toBeNull();
      expect(Tool.extractMessage({})).toBeNull();
      expect(Tool.extractMessage(null)).toBeNull();
    });
  });

  describe("process()", () => {
    it("returns params from the concrete implementation", async () => {
      const tool = new StubTool();
      const params = { foo: "bar" };
      const result = await tool.process(fakeContext, params);
      expect(result).toEqual(params);
    });
  });
});
