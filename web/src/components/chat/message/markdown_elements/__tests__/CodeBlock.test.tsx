import React from "react";
import { render as rtlRender, RenderResult } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../../__mocks__/themeMock";
import { CodeBlock } from "../CodeBlock";

const render = (ui: React.ReactElement): RenderResult =>
  rtlRender(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("CodeBlock", () => {
  it("renders Prism token spans for a known language", () => {
    const { container } = render(
      <CodeBlock inline={false} className="language-javascript">
        {"const x = 1;"}
      </CodeBlock>
    );
    const code = container.querySelector("code.language-javascript");
    expect(code).not.toBeNull();
    expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
    expect(code?.textContent).toBe("const x = 1;");
  });

  it("falls back to plain text for an unknown language", () => {
    const { container } = render(
      <CodeBlock inline={false} className="language-notarealanguage">
        {"some plain content"}
      </CodeBlock>
    );
    const code = container.querySelector("code.language-notarealanguage");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("some plain content");
    expect(container.querySelectorAll(".token").length).toBe(0);
  });

  it("never renders malicious code content as live DOM (highlighted path)", () => {
    const payload = 'const s = "<img src=x onerror=alert(1)>";';
    const { container } = render(
      <CodeBlock inline={false} className="language-javascript">
        {payload}
      </CodeBlock>
    );
    expect(container.querySelector("img")).toBeNull();
    const code = container.querySelector("code");
    expect(code?.textContent).toBe(payload);
  });

  it("never renders malicious code content as live DOM (plain-text path)", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <CodeBlock inline={false} className="language-unknownlang">
        {payload}
      </CodeBlock>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe(payload);
  });

  it("highlights mixed-case languages and keeps the original casing in the header", () => {
    const { container } = render(
      <CodeBlock inline={false} className="language-JavaScript">
        {"const x = 1;"}
      </CodeBlock>
    );
    expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
    expect(container.querySelector("code.language-javascript")).not.toBeNull();
    expect(
      container.querySelector(".code-block-language")?.textContent
    ).toBe("JavaScript");
  });

  it("renders a fenced svg block as a live SVG", () => {
    const { container } = render(
      <CodeBlock inline={false} className="language-svg">
        {'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>'}
      </CodeBlock>
    );
    const preview = container.querySelector("[data-testid='svg-preview']");
    expect(preview).not.toBeNull();
    const svg = preview?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("circle")).not.toBeNull();
    expect(container.querySelector("code")).toBeNull();
  });

  it("renders an unlabeled block whose body is an SVG document", () => {
    const { container } = render(
      <CodeBlock inline={false}>
        {'<?xml version="1.0"?><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'}
      </CodeBlock>
    );
    expect(container.querySelector("[data-testid='svg-preview'] svg")).not.toBeNull();
    expect(container.querySelector("rect")).not.toBeNull();
  });

  it("does not render SVG markup inside a JavaScript block", () => {
    const payload =
      'const s = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>`;';
    const { container } = render(
      <CodeBlock inline={false} className="language-javascript">
        {payload}
      </CodeBlock>
    );
    expect(container.querySelector("[data-testid='svg-preview']")).toBeNull();
    expect(container.querySelector(".svg-preview svg")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe(payload);
  });

  it("strips script and event handlers from rendered SVG", () => {
    const payload =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><circle cx="1" cy="1" r="1"/></svg>';
    const { container } = render(
      <CodeBlock inline={false} className="language-svg">
        {payload}
      </CodeBlock>
    );
    const preview = container.querySelector("[data-testid='svg-preview']");
    expect(preview).not.toBeNull();
    expect(preview?.querySelector("script")).toBeNull();
    expect(preview?.querySelector("svg")?.getAttribute("onload")).toBeNull();
    expect(preview?.querySelector("circle")).not.toBeNull();
  });

  it("sizes a viewBox-only SVG so the frame matches the drawing", () => {
    const { container } = render(
      <CodeBlock inline={false} className="language-svg">
        {'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 400"><rect width="100" height="400"/></svg>'}
      </CodeBlock>
    );
    const svg = container.querySelector("[data-testid='svg-preview'] svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBeNull();
    expect(svg?.getAttribute("height")).toBeNull();
    expect(svg).toHaveStyle({ aspectRatio: "100 / 400", width: "100%", height: "auto" });
  });
});
