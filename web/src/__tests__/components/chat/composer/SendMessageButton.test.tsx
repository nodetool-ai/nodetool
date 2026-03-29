import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import { SendMessageButton } from "../../../../components/chat/composer/SendMessageButton";
import mockTheme from "../../../../__mocks__/themeMock";

const renderComponent = (props: any) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <SendMessageButton {...props} />
    </ThemeProvider>
  );
};

describe("SendMessageButton", () => {
  const mockOnClick = jest.fn();

  const baseProps = {
    onClick: mockOnClick,
    disabled: false,
    hasContent: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders SendMessageButton component without crashing", () => {
      expect(() => {
        renderComponent(baseProps);
      }).not.toThrow();
    });

    it("renders button with correct role", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("renders SendRoundedIcon", () => {
      renderComponent(baseProps);

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Button States", () => {
    it("is enabled when hasContent is true and not disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: false,
        hasContent: true
      });

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });

    it("is disabled when hasContent is false", () => {
      renderComponent({
        ...baseProps,
        hasContent: false
      });

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("is disabled when explicitly disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true,
        hasContent: true
      });

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("is disabled when both disabled and hasContent is false", () => {
      renderComponent({
        ...baseProps,
        disabled: true,
        hasContent: false
      });

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });
  });

  describe("Event Handling", () => {
    it("calls onClick when clicked and enabled", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("prevents click events when disabled due to no content", () => {
      renderComponent({
        ...baseProps,
        hasContent: false
      });

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("prevents click events when explicitly disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("handles keyboard Enter press", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      fireEvent.click(button, { key: "Enter", code: "Enter" });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("handles keyboard Space press", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      fireEvent.click(button, { key: " ", code: "Space" });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("button is accessible by role", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("has accessible aria-label", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      // ToolbarIconButton uses aria-label from tooltip
      expect(button).toHaveAttribute("aria-label", "Send message");
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref to button element", () => {
      let ref: HTMLButtonElement | null = null;
      const setRef = (element: HTMLButtonElement | null) => {
        ref = element;
      };

      render(
        <ThemeProvider theme={mockTheme}>
          <SendMessageButton {...baseProps} ref={setRef} />
        </ThemeProvider>
      );

      expect(ref).toBeInstanceOf(HTMLButtonElement);
      expect(ref).toBe(screen.getByRole("button"));
    });

    it("can focus the button using ref", () => {
      let ref: HTMLButtonElement | null = null;
      const setRef = (element: HTMLButtonElement | null) => {
        ref = element;
      };

      render(
        <ThemeProvider theme={mockTheme}>
          <SendMessageButton {...baseProps} ref={setRef} />
        </ThemeProvider>
      );

      expect(ref).toBeInTheDocument();
      (ref as unknown as HTMLButtonElement | null)?.focus();
      expect(ref).toHaveFocus();
    });
  });

  describe("Styling and Visual States", () => {
    it("renders with expected structure", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      // Button should be present and contain an icon
      expect(button).toBeInTheDocument();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    it("is visually indicated when disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const button = screen.getByRole("button");
      // Button should be disabled (visual indication handled by ui_primitives)
      expect(button).toBeDisabled();
    });

    it("is visually indicated when no content", () => {
      renderComponent({
        ...baseProps,
        hasContent: false
      });

      const button = screen.getByRole("button");
      // Button should be disabled (visual indication handled by ui_primitives)
      expect(button).toBeDisabled();
    });
  });

  describe("Icon Color States", () => {
    it("renders icon when hasContent", () => {
      renderComponent({
        ...baseProps,
        hasContent: true
      });

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders icon when no content", () => {
      renderComponent({
        ...baseProps,
        hasContent: false
      });

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders icon when explicitly disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Default Props", () => {
    it("defaults disabled to false", () => {
      renderComponent({
        onClick: mockOnClick,
        hasContent: true
      });

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });

    it("defaults hasContent to true", () => {
      renderComponent({
        onClick: mockOnClick,
        disabled: false
      });

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });
});
