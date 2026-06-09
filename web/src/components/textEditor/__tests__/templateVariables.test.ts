import {
  allowsSingleBraceVariables,
  findTemplateVariables,
  uniqueTemplateVariables,
  formatVariableToken
} from "../templateVariables";

describe("allowsSingleBraceVariables", () => {
  it.each(["", "plaintext", "text", "markdown", "md"])(
    'returns true for prose language "%s"',
    (lang) => {
      expect(allowsSingleBraceVariables(lang)).toBe(true);
    }
  );

  it.each(["javascript", "python", "typescript", "json"])(
    'returns false for code language "%s"',
    (lang) => {
      expect(allowsSingleBraceVariables(lang)).toBe(false);
    }
  );

  it("returns true when language is undefined", () => {
    expect(allowsSingleBraceVariables()).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(allowsSingleBraceVariables("Markdown")).toBe(true);
    expect(allowsSingleBraceVariables("PLAINTEXT")).toBe(true);
  });
});

describe("findTemplateVariables", () => {
  it("finds double-brace variables", () => {
    const matches = findTemplateVariables("Hello {{ name }}", false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: "name",
      syntax: "double",
      start: 6,
      end: 16
    });
  });

  it("finds multiple double-brace variables", () => {
    const matches = findTemplateVariables(
      "{{ greeting }} {{ name }}!",
      false
    );
    expect(matches).toHaveLength(2);
    expect(matches[0].name).toBe("greeting");
    expect(matches[1].name).toBe("name");
  });

  it("ignores single-brace when includeSingle is false", () => {
    const matches = findTemplateVariables("Hello {name}", false);
    expect(matches).toHaveLength(0);
  });

  it("finds single-brace variables when includeSingle is true", () => {
    const matches = findTemplateVariables("Hello {name}", true);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: "name",
      syntax: "single"
    });
  });

  it("does not double-count a double-brace as single-brace", () => {
    const matches = findTemplateVariables("{{ name }}", true);
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe("double");
  });

  it("handles mixed double and single braces", () => {
    const matches = findTemplateVariables(
      "{{ greeting }} {name}",
      true
    );
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ name: "greeting", syntax: "double" });
    expect(matches[1]).toMatchObject({ name: "name", syntax: "single" });
  });

  it("returns matches in document order", () => {
    const matches = findTemplateVariables(
      "{b} {{ a }} {c}",
      true
    );
    expect(matches.map((m) => m.name)).toEqual(["b", "a", "c"]);
    expect(matches[0].start).toBeLessThan(matches[1].start);
    expect(matches[1].start).toBeLessThan(matches[2].start);
  });

  it("allows underscores and digits in variable names", () => {
    const matches = findTemplateVariables("{{ my_var2 }}", false);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("my_var2");
  });

  it("rejects names starting with a digit", () => {
    const matches = findTemplateVariables("{{ 2fast }}", false);
    expect(matches).toHaveLength(0);
  });

  it("returns empty array for text with no variables", () => {
    expect(findTemplateVariables("plain text", false)).toHaveLength(0);
    expect(findTemplateVariables("plain text", true)).toHaveLength(0);
  });

  it("handles empty string", () => {
    expect(findTemplateVariables("", false)).toHaveLength(0);
  });
});

describe("uniqueTemplateVariables", () => {
  it("deduplicates repeated variable names", () => {
    const vars = uniqueTemplateVariables(
      "{{ x }} and {{ x }} again",
      false
    );
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe("x");
    expect(vars[0].count).toBe(2);
  });

  it("preserves first-appearance order", () => {
    const vars = uniqueTemplateVariables(
      "{{ b }} {{ a }} {{ c }}",
      false
    );
    expect(vars.map((v) => v.name)).toEqual(["b", "a", "c"]);
  });

  it("uses the syntax of the first occurrence", () => {
    const vars = uniqueTemplateVariables(
      "{{ name }} and {name}",
      true
    );
    expect(vars).toHaveLength(1);
    expect(vars[0].syntax).toBe("double");
    expect(vars[0].count).toBe(2);
  });

  it("counts single-brace occurrences when enabled", () => {
    const vars = uniqueTemplateVariables("{x} {x} {x}", true);
    expect(vars).toHaveLength(1);
    expect(vars[0].count).toBe(3);
  });

  it("returns empty for text with no variables", () => {
    expect(uniqueTemplateVariables("nothing here", false)).toHaveLength(0);
  });
});

describe("formatVariableToken", () => {
  it("formats double-brace token by default", () => {
    expect(formatVariableToken("name")).toBe("{{ name }}");
  });

  it("formats double-brace token explicitly", () => {
    expect(formatVariableToken("name", "double")).toBe("{{ name }}");
  });

  it("formats single-brace token", () => {
    expect(formatVariableToken("name", "single")).toBe("{name}");
  });
});
