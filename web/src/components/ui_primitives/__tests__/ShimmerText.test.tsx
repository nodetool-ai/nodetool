import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ShimmerText } from "../ShimmerText";
import { queryElement } from "../../../test-utils/doubles";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("ShimmerText", () => {
  it("renders its children as text", () => {
    renderWithTheme(<ShimmerText>Thinking…</ShimmerText>);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("stays inline so a truncating parent can still ellipsize it", () => {
    const { container } = renderWithTheme(
      <ShimmerText>search_the_web</ShimmerText>
    );
    const span = queryElement(container, "span");
    expect(getComputedStyle(span).display).toBe("inline");
  });

  it("forwards span attributes", () => {
    renderWithTheme(
      <ShimmerText aria-label="working" data-testid="shimmer">
        Responding…
      </ShimmerText>
    );
    expect(screen.getByTestId("shimmer")).toHaveAttribute(
      "aria-label",
      "working"
    );
  });
});
