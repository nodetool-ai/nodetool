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
});
