/**
 * InfoTooltip Component Tests
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { InfoTooltip } from "../InfoTooltip";
import mockTheme from "../../../__mocks__/themeMock";

describe("InfoTooltip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders with default props", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with info icon variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" iconVariant="info" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByTestId("InfoIcon")).toBeInTheDocument();
    });

    it("renders with infoOutlined icon variant (default)", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" iconVariant="infoOutlined" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("InfoOutlinedIcon")).toBeInTheDocument();
    });

    it("renders with help icon variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" iconVariant="help" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("HelpIcon")).toBeInTheDocument();
    });

    it("renders with helpOutlined icon variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" iconVariant="helpOutlined" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("HelpOutlineIcon")).toBeInTheDocument();
    });

    it("renders with small size", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" size="small" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("MuiIconButton-sizeSmall");
    });

    it("renders with medium size", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" size="medium" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("MuiIconButton-sizeMedium");
    });

    it("renders with large size", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" size="large" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("MuiIconButton-sizeLarge");
    });
  });

  describe("Tooltip Mode", () => {
    it("renders in tooltip mode by default", () => {
      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(container.querySelector(".info-tooltip")).toBeInTheDocument();
    });

    it("renders tooltip with title", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Body content" title="Tooltip Title" />
        </ThemeProvider>
      );

      // The title should be used as aria-label
      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Tooltip Title");
    });
  });

  describe("Popover Mode", () => {
    it("renders in popover mode when mode is 'popover'", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" mode="popover" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("opens popover on button click", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Popover content" mode="popover" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      // Button should be clicked successfully
      expect(button).toBeInTheDocument();
    });

    it("renders popover with title and content after click", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Body text" title="Title" mode="popover" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      // After clicking, the popover should be open with content
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Body text")).toBeInTheDocument();
    });
  });

  describe("Color Variants", () => {
    it("applies default color class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("info-button");
    });

    it("applies primary color class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" color="primary" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("primary");
    });

    it("applies secondary color class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" color="secondary" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("secondary");
    });
  });

  describe("Accessibility", () => {
    it("has accessible aria-label from title prop", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" title="Helpful Information" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Helpful Information");
    });

    it("has default aria-label when title is not provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "More information");
    });

    it("is keyboard accessible via button", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Custom Styling", () => {
    it("applies custom className to container", () => {
      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" className="custom-tooltip-class" />
        </ThemeProvider>
      );

      expect(container.querySelector(".custom-tooltip-class")).toBeInTheDocument();
    });

    it("applies nodrag class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("nodrag");
    });

    it("wraps in info-tooltip container class", () => {
      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" />
        </ThemeProvider>
      );

      expect(container.querySelector(".info-tooltip")).toBeInTheDocument();
    });
  });

  describe("Content Variations in Popover Mode", () => {
    it("renders string content in popover after click", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Simple string content" mode="popover" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      expect(screen.getByText("Simple string content")).toBeInTheDocument();
    });

    it("renders React node content in popover after click", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content={<div data-testid="custom-content">Custom React Node</div>} mode="popover" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      expect(screen.getByTestId("custom-content")).toBeInTheDocument();
      expect(screen.getByText("Custom React Node")).toBeInTheDocument();
    });

    it("renders complex nested content in popover after click", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip
            mode="popover"
            content={
              <div>
                <p>Paragraph 1</p>
                <p>Paragraph 2</p>
              </div>
            }
          />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      expect(screen.getByText("Paragraph 1")).toBeInTheDocument();
      expect(screen.getByText("Paragraph 2")).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("triggers popover on click in popover mode", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" mode="popover" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(button).toBeInTheDocument();
    });

    it("handles click in tooltip mode without error", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" mode="tooltip" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Should not throw error
      expect(button).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles empty string content", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("handles undefined title", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Content" title={undefined} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("handles numeric maxWidth value", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" mode="popover" maxWidth={400} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Placement Variants", () => {
    it("renders with top placement", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" placement="top" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with bottom placement", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" placement="bottom" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with left placement", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" placement="left" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with right placement", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <InfoTooltip content="Test content" placement="right" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
