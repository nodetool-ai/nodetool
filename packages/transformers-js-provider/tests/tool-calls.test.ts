import { describe, expect, it } from "vitest";
import { toToolSpecs } from "@nodetool-ai/runtime";
import { templateSupportsTools, toTemplateMessages } from "../src/tool-calls.js";

const specs = toToolSpecs([
  {
    name: "get_weather",
    description: "Weather for a city",
    inputSchema: { type: "object", properties: { city: { type: "string" } } }
  }
]);

describe("toTemplateMessages", () => {
  const history = [
    { role: "system" as const, content: "Be brief." },
    { role: "user" as const, content: "Weather in Paris?" },
    {
      role: "assistant" as const,
      content: "",
      toolCalls: [{ id: "c1", name: "get_weather", args: { city: "Paris" } }]
    },
    { role: "tool" as const, toolCallId: "c1", content: "Sunny" }
  ];

  it("uses the template's own fields for a native template", () => {
    expect(toTemplateMessages(history, specs, true)).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Weather in Paris?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { type: "function", function: { name: "get_weather", arguments: { city: "Paris" } } }
        ]
      },
      { role: "tool", content: "Sunny" }
    ]);
  });

  it("writes calls, results and the tools prompt as text otherwise", () => {
    const out = toTemplateMessages(history, specs, false);
    expect(out[0].role).toBe("system");
    expect(out[0].content).toContain("Be brief.");
    expect(out[0].content).toContain('"name":"get_weather"');
    expect(out[2]).toEqual({
      role: "assistant",
      content: '<tool_call>[{"name":"get_weather","arguments":{"city":"Paris"}}]</tool_call>'
    });
    expect(out[3]).toEqual({ role: "tool", content: "Sunny" });
  });

  it("sends results as named user messages for a template that rejects the tool role", () => {
    const out = toTemplateMessages(history, specs, false, "user");
    expect(out[3]).toEqual({ role: "user", content: "Result of get_weather:\nSunny" });
  });

  it("adds a system message when the history has none", () => {
    const out = toTemplateMessages([{ role: "user", content: "hi" }], specs, false);
    expect(out.map((m) => m.role)).toEqual(["system", "user"]);
  });
});

describe("templateSupportsTools", () => {
  it("checks whether the template reads the tools variable", () => {
    const render = () => "";
    expect(
      templateSupportsTools(
        { apply_chat_template: render, get_chat_template: () => "{% if tools %}x{% endif %}" },
        specs
      )
    ).toBe(true);
    expect(
      templateSupportsTools(
        { apply_chat_template: render, get_chat_template: () => "{{ message['content'] }}" },
        specs
      )
    ).toBe(false);
    expect(
      templateSupportsTools(
        {
          apply_chat_template: render,
          get_chat_template: () => {
            throw new Error("no template");
          }
        },
        specs
      )
    ).toBe(false);
  });
});
