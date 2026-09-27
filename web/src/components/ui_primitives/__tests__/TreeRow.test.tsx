import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TreeRow } from "../TreeRow";

describe("TreeRow", () => {
  it("renders children and forwards its ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ThemeProvider theme={mockTheme}>
        <TreeRow ref={ref}>Layer</TreeRow>
      </ThemeProvider>
    );
    expect(screen.getByText("Layer")).toBeInTheDocument();
    expect(ref.current).toBe(screen.getByText("Layer"));
  });

  it("keeps interaction semantics under editor control", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <TreeRow role="button" tabIndex={0} aria-pressed selected interactive>
          Object
        </TreeRow>
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: "Object" })).toHaveAttribute("aria-pressed", "true");
  });
});
