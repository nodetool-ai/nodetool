import React, { Fragment } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import KeyboardShortcutsDialog from "../KeyboardShortcutsDialog";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2", contrastText: "#fff" },
    secondary: { main: "#dc004e", contrastText: "#fff" },
    warning: { main: "#ff9800", contrastText: "#000" },
    info: { main: "#2196f3", contrastText: "#fff" },
    success: { main: "#4caf50", contrastText: "#fff" },
    text: { primary: "#000", secondary: "#666" },
    background: { paper: "#fff" },
    divider: "#e0e0e0",
    action: { hover: "rgba(0,0,0,0.04)" }
  }
});

describe("KeyboardShortcutsDialog", () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn()
  };

  const renderComponent = (props = defaultProps) => {
    return render(
      <Fragment>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <KeyboardShortcutsDialog {...props} />
        </ThemeProvider>
      </Fragment>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dialog when open is true", () => {
    renderComponent();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("does not render dialog when open is false", () => {
    renderComponent({ ...defaultProps, open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = jest.fn();
    renderComponent({ ...defaultProps, onClose });

    const closeButton = screen.getByLabelText("Close");
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Close button in footer is clicked", async () => {
    const onClose = jest.fn();
    renderComponent({ ...defaultProps, onClose });

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    const closeFooterButton = closeButtons[closeButtons.length - 1];
    await userEvent.click(closeFooterButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays shortcut count in the title", () => {
    renderComponent();

    expect(screen.getByText(`${NODE_EDITOR_SHORTCUTS.length} shortcuts`)).toBeInTheDocument();
  });

  it("shows editor shortcuts by default", () => {
    renderComponent();

    const tabpanel = screen.getByRole("tabpanel");
    expect(tabpanel).toBeInTheDocument();
  });

  it("displays shortcut titles", () => {
    renderComponent();

    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Paste")).toBeInTheDocument();
  });

  it("displays keyboard key chips for shortcuts", () => {
    renderComponent();

    const ctrlChips = screen.getAllByText("Ctrl");
    expect(ctrlChips.length).toBeGreaterThan(0);
  });

  it("displays shortcut descriptions when available", () => {
    renderComponent();

    const copyDescriptions = screen.getAllByText(/copy selected nodes/i);
    expect(copyDescriptions.length).toBeGreaterThan(0);
  });

  it("displays footer with tip about command menu", () => {
    renderComponent();

    expect(screen.getByText(/press/i)).toBeInTheDocument();
    expect(screen.getByText(/command menu/i)).toBeInTheDocument();
  });

  it("closes on Escape key press", async () => {
    const onClose = jest.fn();
    renderComponent({ ...defaultProps, onClose });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has proper accessibility attributes", () => {
    renderComponent();

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(0);
  });

  it("displays workflow shortcuts category", () => {
    renderComponent();

    const workflowTab = screen.getByRole("tab", { name: /workflows/i });
    expect(workflowTab).toBeInTheDocument();
  });

  it("displays panel shortcuts category", () => {
    renderComponent();

    const panelTab = screen.getByRole("tab", { name: /panels/i });
    expect(panelTab).toBeInTheDocument();
  });

  it("allows switching between tabs", async () => {
    renderComponent();

    const workflowTab = screen.getByRole("tab", { name: /workflows/i });
    await userEvent.click(workflowTab);

    const workflowTabpanel = screen.getByRole("tabpanel");
    expect(workflowTabpanel).toBeInTheDocument();
  });
});
