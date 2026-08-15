import { formatJavaScriptForDisplay } from "../formatJavaScript";

describe("formatJavaScriptForDisplay", () => {
  it("dedents and trims an already-readable program", () => {
    expect(
      formatJavaScriptForDisplay("\n    const n = 1;\n    return n;\n")
    ).toBe("const n = 1;\nreturn n;");
  });

  it("splits packed top-level statements onto their own lines", () => {
    expect(
      formatJavaScriptForDisplay(
        "const listed = await nodetool.workflows.list(); const n = listed.workflows.length; return { n };"
      )
    ).toBe(
      [
        "const listed = await nodetool.workflows.list();",
        "const n = listed.workflows.length;",
        "return {",
        "  n",
        "};"
      ].join("\n")
    );
  });

  it("indents a dense object argument", () => {
    expect(
      formatJavaScriptForDisplay(
        'await tools.run_workflow({id: "abc", params: {prompt: "hi"}});'
      )
    ).toBe(
      [
        "await tools.run_workflow({",
        "  id: \"abc\",",
        "  params: {",
        "    prompt: \"hi\"",
        "  }",
        "});"
      ].join("\n")
    );
  });

  it("keeps for-loop semicolons on one line", () => {
    expect(
      formatJavaScriptForDisplay("for (let i = 0; i < n; i++) total += i;")
    ).toBe("for (let i = 0; i < n; i++) total += i;");
  });

  it("does not break braces or semicolons inside strings", () => {
    expect(
      formatJavaScriptForDisplay('const s = "a; b { c }"; return s;')
    ).toBe('const s = "a; b { c }";\nreturn s;');
  });

  it("keeps else on the same line as the closing brace", () => {
    expect(
      formatJavaScriptForDisplay("if (ok) { return 1; } else { return 2; }")
    ).toBe("if (ok) {\n  return 1;\n} else {\n  return 2;\n}");
  });

  it("leaves a short single statement alone", () => {
    expect(formatJavaScriptForDisplay("return 1;")).toBe("return 1;");
  });

  it("returns an empty string for blank input", () => {
    expect(formatJavaScriptForDisplay("  \n  ")).toBe("");
  });

  it("keeps numeric literals intact", () => {
    expect(
      formatJavaScriptForDisplay(
        "await nodetool.media.generateImage(prompt, model, {width: 512, height: 512});"
      )
    ).toBe(
      [
        "await nodetool.media.generateImage(prompt, model, {",
        "  width: 512,",
        "  height: 512",
        "});"
      ].join("\n")
    );
  });

  it("puts each array element on its own line", () => {
    expect(
      formatJavaScriptForDisplay(
        'const story = ["Once upon a time", "The next day"]; const images = [];'
      )
    ).toBe(
      [
        "const story = [",
        '  "Once upon a time",',
        '  "The next day"',
        "];",
        "const images = [];"
      ].join("\n")
    );
  });

  it("breaks a packed CodeAct action into statements, arrays, and a for body", () => {
    const src =
      'const model = await nodetool.models.pick("text_to_image"); ' +
      'const story = ["Once upon a time", "The next day"]; ' +
      "const images = []; " +
      "for (const prompt of prompts) { " +
      "const img = await nodetool.media.generateImage(prompt, model, { width: 512, height: 512 }); " +
      "images.push(img); } " +
      "return { story, images };";

    expect(formatJavaScriptForDisplay(src)).toBe(
      [
        'const model = await nodetool.models.pick("text_to_image");',
        "const story = [",
        '  "Once upon a time",',
        '  "The next day"',
        "];",
        "const images = [];",
        "for (const prompt of prompts) {",
        "  const img = await nodetool.media.generateImage(prompt, model, {",
        "    width: 512,",
        "    height: 512",
        "  });",
        "  images.push(img);",
        "}",
        "return {",
        "  story,",
        "  images",
        "};"
      ].join("\n")
    );
  });
});
