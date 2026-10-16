import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Code } from "../Code";
import { CodeBlock } from "../CodeBlock";
import { LogView, logLevelColor } from "../LogView";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Code", () => {
  it("renders a code element", () => {
    renderWithTheme(<p>Run <Code>npm test</Code></p>);
    expect(screen.getByText("npm test").tagName).toBe("CODE");
  });
});

describe("CodeBlock", () => {
  it("renders text in a pre without a header by default", () => {
    const { container } = renderWithTheme(<CodeBlock>{"a\nb"}</CodeBlock>);
    expect(container.querySelector("pre")?.textContent).toBe("a\nb");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the language and a copy button in the header", () => {
    renderWithTheme(
      <CodeBlock language="js" copyable>
        {"x = 1"}
      </CodeBlock>
    );
    expect(screen.getByText("js")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("LogView", () => {
  it("renders string and leveled lines", () => {
    const { container } = renderWithTheme(
      <LogView lines={["one", { text: "two", level: "error" }]} />
    );
    expect(screen.getByText("one")).toHaveAttribute("data-level", "info");
    expect(screen.getByText("two")).toHaveAttribute("data-level", "error");
    expect(container.querySelectorAll("[data-level]")).toHaveLength(2);
  });

  it("shows the empty text when there are no lines", () => {
    renderWithTheme(<LogView lines={[]} emptyText="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("offers copy only when requested and non-empty", () => {
    const { rerender } = renderWithTheme(<LogView lines={["a"]} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <LogView lines={["a"]} copyable />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("maps levels to distinct palette colours", () => {
    const colors = (["info", "warning", "error"] as const).map((l) =>
      logLevelColor(mockTheme as never, l)
    );
    expect(new Set(colors).size).toBe(3);
  });
});
