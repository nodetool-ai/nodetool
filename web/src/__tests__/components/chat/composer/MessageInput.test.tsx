import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../../../../components/chat/composer/MessageInput";

const renderComponent = (props: any) => {
  return render(<MessageInput {...props} />);
};

describe("MessageInput", () => {
  const mockOnChange = jest.fn();
  const mockOnKeyDown = jest.fn();

  const baseProps = {
    value: "",
    onChange: mockOnChange,
    onKeyDown: mockOnKeyDown,
    disabled: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders MessageInput component without crashing", () => {
      expect(() => {
        renderComponent(baseProps);
      }).not.toThrow();
    });

    it("renders textarea with correct attributes", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");

      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute("class", "chat-input");
      expect(textarea).toHaveAttribute("id", "chat-prompt");
      expect(textarea).toHaveAttribute("aria-labelledby", "chat-prompt");
    });

    it("renders with default placeholder", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("placeholder", "Type your message...");
    });

    it("renders with custom placeholder", () => {
      renderComponent({
        ...baseProps,
        placeholder: "Custom placeholder"
      });

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("placeholder", "Custom placeholder");
    });
  });

  describe("Value Handling", () => {
    it("displays the provided value", () => {
      renderComponent({
        ...baseProps,
        value: "Hello world"
      });

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Hello world");
    });

    it("updates value when props change", () => {
      const { rerender } = renderComponent({
        ...baseProps,
        value: "Initial value"
      });

      let textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Initial value");

      rerender(<MessageInput {...baseProps} value="Updated value" />);

      textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Updated value");
    });
  });

  describe("Event Handling", () => {
    it("calls onChange when user types", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "test");

      expect(mockOnChange).toHaveBeenCalled();
      // Verify that onChange is called with an event object that has target
      const lastCall =
        mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0];
      expect(lastCall).toHaveProperty("target");
      expect(typeof lastCall.target).toBe("object");
    });

    it("calls onKeyDown when keys are pressed", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

      expect(mockOnKeyDown).toHaveBeenCalledTimes(1);
      expect(mockOnKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "Enter",
          code: "Enter"
        })
      );
    });

    it("handles Enter key press", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

      expect(mockOnKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "Enter",
          code: "Enter"
        })
      );
    });

    it("handles Shift+Enter key combination", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, {
        key: "Enter",
        code: "Enter",
        shiftKey: true
      });

      expect(mockOnKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "Enter",
          code: "Enter",
          shiftKey: true
        })
      );
    });

    it("handles other key presses", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "a", code: "KeyA" });

      expect(mockOnKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "a",
          code: "KeyA"
        })
      );
    });
  });

  describe("Disabled State", () => {
    it("is enabled by default", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).not.toBeDisabled();
    });

    it("can be disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeDisabled();
    });

    it("calls onChange even when disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "New text" } });

      // Note: onChange should still be called even if disabled
      // This is the expected behavior for controlled components
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("calls onKeyDown even when disabled", () => {
      renderComponent({
        ...baseProps,
        disabled: true
      });

      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

      expect(mockOnKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref to textarea element", () => {
      let ref: HTMLTextAreaElement | null = null;
      const setRef = (element: HTMLTextAreaElement | null) => {
        ref = element;
      };

      render(<MessageInput {...baseProps} ref={setRef} />);

      expect(ref).toBeInstanceOf(HTMLTextAreaElement);
      expect(ref).toBe(screen.getByRole("textbox"));
    });

    it("can focus the textarea using ref", () => {
      let ref: HTMLTextAreaElement | null = null;
      const setRef = (element: HTMLTextAreaElement | null) => {
        ref = element;
      };

      render(<MessageInput {...baseProps} ref={setRef} />);

      expect(ref).toBeInTheDocument();
      (ref as unknown as HTMLTextAreaElement | null)?.focus();
      expect(ref).toHaveFocus();
    });
  });

  describe("Accessibility", () => {
    it("has correct aria-labelledby attribute", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("aria-labelledby", "chat-prompt");
    });

    it("has correct id attribute", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("id", "chat-prompt");
    });
  });

  describe("Input Attributes", () => {
    it("has correct class name", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("class", "chat-input");
    });

    it("has correct autocorrect setting", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("autoCorrect", "off");
    });

    it("has correct autocapitalize setting", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("autoCapitalize", "none");
    });

    it("has correct spellcheck setting", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("spellCheck", "false");
    });

    it("has correct autocomplete setting", () => {
      renderComponent(baseProps);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("autoComplete", "off");
    });
  });
});
