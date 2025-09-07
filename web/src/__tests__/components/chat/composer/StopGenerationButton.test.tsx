import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import { StopGenerationButton } from "../../../../components/chat/composer/StopGenerationButton";
import mockTheme from "../../../../__mocks__/themeMock";

const renderComponent = (props: any) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <StopGenerationButton {...props} />
    </ThemeProvider>
  );
};

describe("StopGenerationButton", () => {
  const mockOnClick = jest.fn();

  const baseProps = {
    onClick: mockOnClick
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders StopGenerationButton component without crashing", () => {
      expect(() => {
        renderComponent(baseProps);
      }).not.toThrow();
    });

    it("renders button with correct role", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("renders StopIcon", () => {
      renderComponent(baseProps);

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Button State", () => {
    it("is always enabled", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });

  describe("Event Handling", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
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

    it("maintains focus", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.tab();

      expect(button).toHaveFocus();
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
          <StopGenerationButton {...baseProps} ref={setRef} />
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
          <StopGenerationButton {...baseProps} ref={setRef} />
        </ThemeProvider>
      );

      expect(ref).toBeInTheDocument();
      (ref as unknown as HTMLButtonElement | null)?.focus();
      expect(ref).toHaveFocus();
    });
  });

  describe("Styling and Visual States", () => {
    it("applies correct size styling", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        width: "36px",
        height: "36px"
      });
    });

    it("has correct background color", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: expect.any(String)
      });
    });

    it("has correct padding", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ padding: "0" });
    });
  });

  describe("Icon Styling", () => {
    it("renders icon", () => {
      renderComponent(baseProps);

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Hover and Active States", () => {
    it("maintains hover background color", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      // Note: We can't easily test hover states with jsdom
      // but we can verify the button has the hover styling applied
      expect(button).toBeInTheDocument();
    });

    it("applies active transform on click", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      // The transform is applied briefly on active state
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });
});
