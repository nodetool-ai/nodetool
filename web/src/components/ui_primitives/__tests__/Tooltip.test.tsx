import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { Tooltip } from "../Tooltip";
import { EditorButton } from "../../editor_ui/EditorButton";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const hoverAndWait = (element: HTMLElement) => {
  jest.useFakeTimers();
  fireEvent.mouseOver(element);
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  jest.useRealTimers();
};

describe("Tooltip", () => {
  it("draws the shortcut as a key hint below the title", () => {
    renderWithTheme(
      <Tooltip title="Undo" shortcut={["Ctrl", "Z"]}>
        <button type="button" aria-label="Undo" />
      </Tooltip>
    );

    hoverAndWait(screen.getByRole("button", { name: "Undo" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Undo");
    expect(tooltip).toHaveTextContent("Ctrl");
    expect(tooltip).toHaveTextContent("Z");
  });

  it("renders only the children when disabled", () => {
    renderWithTheme(
      <Tooltip title="Next match" disabled>
        <button type="button">Next</button>
      </Tooltip>
    );

    hoverAndWait(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("EditorButton tooltip", () => {
  it("describes the button without renaming it", () => {
    renderWithTheme(
      <EditorButton tooltip="Lift this node's body into a new script">
        Extract
      </EditorButton>
    );

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).not.toHaveAttribute("title");
    hoverAndWait(button);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Lift this node's body into a new script"
    );
    expect(screen.getByRole("button", { name: "Extract" })).toBeInTheDocument();
  });

  it("still shows the tooltip while the button is disabled", () => {
    renderWithTheme(
      <EditorButton tooltip="This shot is already rendering" disabled>
        Regenerate
      </EditorButton>
    );

    const button = screen.getByRole("button", { name: "Regenerate" });
    hoverAndWait(button.parentElement as HTMLElement);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "This shot is already rendering"
    );
  });
});
