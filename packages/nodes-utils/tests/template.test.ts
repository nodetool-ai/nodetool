import { describe, it, expect } from "vitest";
import { renderTemplate } from "../src/template.js";

describe("renderTemplate", () => {
  it("substitutes {{ variable }} placeholders", () => {
    expect(renderTemplate("Hello {{ name }}!", { name: "Ada" })).toBe(
      "Hello Ada!"
    );
  });

  it("trims surrounding whitespace inside {{ ... }}", () => {
    expect(renderTemplate("{{   name   }}", { name: "Ada" })).toBe("Ada");
    expect(renderTemplate("{{  name | upper  }}", { name: "ada" })).toBe("ADA");
  });

  it("substitutes {variable} single-brace placeholders", () => {
    expect(renderTemplate("Hello {name}!", { name: "Ada" })).toBe("Hello Ada!");
  });

  it("leaves unknown placeholders intact", () => {
    expect(renderTemplate("{{ a }} and {{ b }}", { a: "x" })).toBe(
      "x and {{ b }}"
    );
  });

  it("does not touch single braces when no matching variable", () => {
    expect(renderTemplate('JSON: {"k": 1}', { name: "Ada" })).toBe(
      'JSON: {"k": 1}'
    );
  });

  it("applies Jinja-style filters", () => {
    expect(renderTemplate("{{ name|upper }}", { name: "ada" })).toBe("ADA");
    expect(renderTemplate("{{ name|capitalize }}", { name: "ada" })).toBe(
      "Ada"
    );
    expect(renderTemplate("{{ t|truncate(3) }}", { t: "abcdef" })).toBe(
      "abc..."
    );
  });

  it("chains multiple filters left to right", () => {
    expect(renderTemplate("{{ name|trim|upper }}", { name: "  ada  " })).toBe(
      "ADA"
    );
  });

  it("uses default filter only when value is empty", () => {
    expect(renderTemplate("{{ x|default(none) }}", { x: "" })).toBe("none");
    expect(renderTemplate("{{ x|default(none) }}", { x: "set" })).toBe("set");
  });

  it("coerces non-string values and treats nullish as empty", () => {
    expect(renderTemplate("n={{ n }} b={{ b }}", { n: 42, b: null })).toBe(
      "n=42 b="
    );
  });

  it("returns the template unchanged when there are no variables", () => {
    expect(renderTemplate("plain {{ x }} {y}", {})).toBe("plain {{ x }} {y}");
  });
});
