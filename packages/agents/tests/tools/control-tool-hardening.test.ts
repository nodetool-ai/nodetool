/**
 * Mutation-hardening tests for control-tool: the sanitize edge cases and the
 * schema/description construction branches that line coverage left unverified.
 */
import { describe, it, expect } from "vitest";
import {
  ControlNodeTool,
  sanitizeToolName
} from "../../src/tools/control-tool.js";
import type { ControlNodeInfo } from "../../src/tools/control-tool.js";

describe("sanitizeToolName — mutation hardening", () => {
  // A non-string that is also truthy distinguishes `||`→`&&` and the dropped
  // guard: both mutants fall through to `name.replace(...)`, which throws.
  it("returns the default for a truthy non-string input", () => {
    expect(sanitizeToolName(123 as unknown as string)).toBe("control_node");
  });

  // Input that sanitizes to the empty string must hit the post-sanitize guard.
  it("returns the default when every character is stripped", () => {
    expect(sanitizeToolName("!!!")).toBe("control_node");
  });
});

describe("ControlNodeTool — schema construction", () => {
  it("spreads object property schemas and wraps non-object/null ones", () => {
    const info: ControlNodeInfo = {
      node_id: "n1",
      node_type: "t",
      node_title: "Title",
      node_description: "desc",
      control_actions: {
        run: {
          properties: {
            bar: { type: "number", description: "a number" },
            foo: "just a string" as unknown as Record<string, unknown>,
            // typeof null === "object", so this exercises the `!== null` guard.
            nul: null as unknown as Record<string, unknown>
          }
        }
      }
    };
    const tool = new ControlNodeTool("n1", info);
    expect(tool.inputSchema["type"]).toBe("object");
    const props = tool.inputSchema["properties"] as Record<string, unknown>;
    // Object branch: schema copied verbatim.
    expect(props["bar"]).toEqual({ type: "number", description: "a number" });
    // Non-object branch: wrapped as a string schema using String(schema).
    expect(props["foo"]).toEqual({
      type: "string",
      description: "just a string"
    });
    // null must take the wrap branch (not the object spread).
    expect(props["nul"]).toEqual({ type: "string", description: "null" });
  });

  it("lists available properties (comma-separated) in the description", () => {
    const info: ControlNodeInfo = {
      node_id: "n2",
      node_type: "t",
      node_title: "Image Resizer",
      control_actions: {
        run: {
          properties: {
            width: { type: "integer" },
            height: { type: "integer" }
          }
        }
      }
    };
    const tool = new ControlNodeTool("n2", info);
    expect(tool.description).toContain("Available properties");
    expect(tool.description).toContain("width, height");
  });

  it("omits the available-properties clause when there are none", () => {
    const tool = new ControlNodeTool("n3", {
      node_id: "n3",
      node_type: "t",
      node_title: "Empty Node"
    });
    expect(tool.description).toBe(
      "Control Empty Node: trigger execution with optional property overrides"
    );
    expect(tool.description).not.toContain("Available properties");
  });

  it("names the triggered properties in userMessage and process output", async () => {
    const info: ControlNodeInfo = {
      node_id: "n4",
      node_type: "t",
      node_title: "Resizer"
    };
    const tool = new ControlNodeTool("n4", info);
    // Two properties so the ", " join separator is observable.
    expect(tool.userMessage({ width: 1, height: 2 })).toBe(
      "Triggering Resizer with properties: width, height"
    );
    const result = (await tool.process({} as never, {
      width: 1,
      height: 2
    })) as string;
    expect(result).toContain("with properties: width, height");
  });
});
