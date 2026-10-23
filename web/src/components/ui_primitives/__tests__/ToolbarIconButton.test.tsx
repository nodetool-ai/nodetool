import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ToolbarIconButton } from "../ToolbarIconButton";
import mockTheme from "../../../__mocks__/themeMock";

import SaveIcon from "@mui/icons-material/Save";

describe("ToolbarIconButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with icon and tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("SaveIcon")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          nodrag={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });

  it("applies active class when active is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          active={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("active");
  });

  it("reports an on/off toggle with aria-pressed", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton icon={<SaveIcon />} tooltip="Wrap" active={false} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton icon={<SaveIcon />} tooltip="Wrap" active />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves aria-pressed off a plain command or a button that opens something", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" />
        <ToolbarIconButton icon={<SaveIcon />} tooltip="More" active aria-expanded />
      </ThemeProvider>
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-pressed");
    }
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={mockOnClick}
          className="custom-class"
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("keeps its name when a shortcut tooltip opens", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          shortcut={["Ctrl", "S"]}
          delay={0}
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("shows its tooltip on hover while disabled", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" delay={0} disabled />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    fireEvent.mouseOver(button.parentElement as HTMLElement);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Save"));
  });

  it("shows disabledReason instead of the tooltip while disabled", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          delay={0}
          disabled
          disabledReason="No unsaved changes"
        />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.mouseOver(button.parentElement as HTMLElement);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toHaveTextContent("No unsaved changes")
    );
  });

  it("ignores disabledReason while enabled", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          delay={0}
          disabledReason="No unsaved changes"
        />
      </ThemeProvider>
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Save"));
  });
  it("shows the button spinner in place of the icon while loading", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ToolbarIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          loading
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(screen.queryByTestId("SaveIcon")).not.toBeInTheDocument();
    expect(button.querySelector(".MuiCircularProgress-root")).not.toBeNull();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
