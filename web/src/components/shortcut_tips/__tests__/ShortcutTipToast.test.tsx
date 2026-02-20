/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ShortcutTipToast } from "../ShortcutTipToast";
import type { ShortcutTip } from "../../../stores/ShortcutTipStore";

const mockTip: ShortcutTip = {
  id: "test-tip",
  shortcut: {
    title: "Save Workflow",
    keys: ["Ctrl", "S"],
    description: "Quickly save your current workflow"
  },
  category: "general",
  priority: 10,
  showCount: 0,
  dismissed: false
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe("ShortcutTipToast", () => {
  it("renders null when tip is null", () => {
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={null} onDismiss={jest.fn()} />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("renders tip when provided", async () => {
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={mockTip} onDismiss={jest.fn()} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.getByText("Pro Tip")).toBeInTheDocument();
    expect(screen.getByText("Save Workflow")).toBeInTheDocument();
    expect(screen.getByText("Quickly save your current workflow")).toBeInTheDocument();
  });

  it("renders keyboard shortcut hint", async () => {
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={mockTip} onDismiss={jest.fn()} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    // Check for individual keys
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("shows category badge when showCategory is true", async () => {
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={mockTip} onDismiss={jest.fn()} showCategory={true} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("does not show category badge when showCategory is false", async () => {
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={mockTip} onDismiss={jest.fn()} showCategory={false} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.queryByText("General")).not.toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", async () => {
    const onDismiss = jest.fn();
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={mockTip} onDismiss={onDismiss} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    const closeButton = screen.getByLabelText("Dismiss tip");
    fireEvent.click(closeButton);
    
    // Wait for the fade-out animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders without description when not provided", async () => {
    const tipWithoutDescription: ShortcutTip = {
      ...mockTip,
      shortcut: {
        title: "Save",
        keys: ["Ctrl", "S"]
      }
    };
    
    const { container } = renderWithTheme(
      <ShortcutTipToast tip={tipWithoutDescription} onDismiss={jest.fn()} />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.queryByText("Quickly save your current workflow")).not.toBeInTheDocument();
  });

  it("renders different category labels", async () => {
    const { container, rerender } = renderWithTheme(
      <ShortcutTipToast 
        tip={{ ...mockTip, category: "editor" }} 
        onDismiss={jest.fn()} 
        showCategory={true}
      />
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.getByText("Editor")).toBeInTheDocument();
    
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ShortcutTipToast 
          tip={{ ...mockTip, category: "workflow" }} 
          onDismiss={jest.fn()} 
          showCategory={true}
        />
      </ThemeProvider>
    );
    
    // Wait for the fade-in animation
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    
    expect(screen.getByText("Workflow")).toBeInTheDocument();
  });
});
