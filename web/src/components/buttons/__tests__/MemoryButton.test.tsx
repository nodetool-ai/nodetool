import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import MemoryButton from "../MemoryButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the MemoryManagementDialog component
jest.mock("../../dialogs/MemoryManagementDialog", () => ({
  __esModule: true,
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="memory-dialog" data-open={open}>
      {open && <button onClick={onClose}>Close Dialog</button>}
    </div>
  )
}));

// Mock MUI components
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, ...rest }: any) => <button {...rest}>{children}</button>
}));

jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>
}));

jest.mock("@mui/icons-material/Memory", () => ({
  __esModule: true,
  default: () => <span data-testid="memory-icon" />
}));

describe("MemoryButton", () => {
  it("renders correctly", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MemoryButton />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("command-icon");
    expect(screen.getByTestId("memory-icon")).toBeInTheDocument();
  });

  it("opens dialog when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MemoryButton />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    
    // Initially, dialog should be closed
    const dialog = screen.getByTestId("memory-dialog");
    expect(dialog).toHaveAttribute("data-open", "false");

    // Click the button to open dialog
    fireEvent.click(button);
    
    // Dialog should now be open
    expect(dialog).toHaveAttribute("data-open", "true");
  });

  it("closes dialog when onClose is called", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MemoryButton />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    
    // Open the dialog
    fireEvent.click(button);
    
    let dialog = screen.getByTestId("memory-dialog");
    expect(dialog).toHaveAttribute("data-open", "true");

    // Close the dialog using the close button
    const closeButton = screen.getByText("Close Dialog");
    fireEvent.click(closeButton);
    
    // Dialog should now be closed
    dialog = screen.getByTestId("memory-dialog");
    expect(dialog).toHaveAttribute("data-open", "false");
  });
});
