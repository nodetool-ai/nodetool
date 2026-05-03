/**
 * Tests for AboutMenu component
 *
 * Tests cover:
 * - Browser fallback view (non-Electron)
 * - Links section
 * - Accessibility
 * - Component rendering
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AboutMenu from "../AboutMenu";

// Mock MUI components
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  CircularProgress: () => <div data-testid="CircularProgress" />,
  Typography: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Box: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Chip: ({ children, ...props }: any) => <span data-testid="Chip" {...props}>{children}</span>,
}));

// Mock UI primitives
jest.mock("../../ui_primitives", () => ({
  FlexRow: ({ children, ...props }: any) => <div data-testid="FlexRow" {...props}>{children}</div>,
  FlexColumn: ({ children, ...props }: any) => <div data-testid="FlexColumn" {...props}>{children}</div>,
  Text: ({ children, ...props }: any) => <span data-testid="Text" {...props}>{children}</span>,
  Caption: ({ children, ...props }: any) => <span data-testid="Caption" {...props}>{children}</span>,
  LoadingSpinner: (props: any) => <div data-testid="LoadingSpinner" {...props} />,
  Chip: ({ children, ...props }: any) => <span data-testid="UIPrimitiveChip" {...props}>{children}</span>,
}));

// Mock stores
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn(() => ({
    addNotification: jest.fn()
  }))
}));

// Mock as browser environment (default)
jest.mock("../../../lib/env", () => ({
  isElectron: false
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

describe("AboutMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Browser Environment Rendering", () => {
    it("should render without crashing", () => {
      const { container } = render(<AboutMenu />, { wrapper });
      expect(container).toBeInTheDocument();
    });

    it("should render application section", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Application")).toBeInTheDocument();
    });

    it("should render operating system section", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Operating System")).toBeInTheDocument();
      expect(screen.getByText("Platform")).toBeInTheDocument();
      expect(screen.getByText("User Agent")).toBeInTheDocument();
    });

    it("should display platform value", () => {
      render(<AboutMenu />, { wrapper });

      // Platform might appear multiple times, check that at least one exists
      const platformElements = screen.getAllByText(navigator.platform);
      expect(platformElements.length).toBeGreaterThan(0);
    });

    it("should display user agent value", () => {
      render(<AboutMenu />, { wrapper });

      // User agent might appear multiple times, check that at least one exists
      const userAgentElements = screen.getAllByText(navigator.userAgent);
      expect(userAgentElements.length).toBeGreaterThan(0);
    });

    it("should render links section", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Links")).toBeInTheDocument();
    });

    it("should not show Electron-only sections in browser", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.queryByText("Installation Paths")).not.toBeInTheDocument();
      expect(screen.queryByText("Features & Versions")).not.toBeInTheDocument();
    });
  });

  describe("Links Section", () => {
    it("should render GitHub Repository link with correct attributes", () => {
      render(<AboutMenu />, { wrapper });

      const link = screen.getByText("GitHub Repository").closest("a");
      expect(link).toHaveAttribute("href", "https://github.com/nodetool-ai/nodetool");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should render NodeTool Forum link with correct attributes", () => {
      render(<AboutMenu />, { wrapper });

      const link = screen.getByText("NodeTool Forum").closest("a");
      expect(link).toHaveAttribute("href", "https://forum.nodetool.ai");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should render Website link with correct attributes", () => {
      render(<AboutMenu />, { wrapper });

      const link = screen.getByText("Website").closest("a");
      expect(link).toHaveAttribute("href", "https://nodetool.ai");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Accessibility", () => {
    it("should render links with accessible names", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByRole("link", { name: "GitHub Repository" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "NodeTool Forum" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Website" })).toBeInTheDocument();
    });

    it("should render main section headings", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Application")).toBeInTheDocument();
      expect(screen.getByText("Operating System")).toBeInTheDocument();
      expect(screen.getByText("Links")).toBeInTheDocument();
    });
  });

  describe("Component Stability", () => {
    it("should render consistently across rerenders", () => {
      const { rerender } = render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Application")).toBeInTheDocument();

      rerender(<ThemeProvider theme={mockTheme}><AboutMenu /></ThemeProvider>);

      expect(screen.getByText("Application")).toBeInTheDocument();
      expect(screen.getByText("Operating System")).toBeInTheDocument();
      expect(screen.getByText("Links")).toBeInTheDocument();
    });

    it("should contain expected main sections", () => {
      render(<AboutMenu />, { wrapper });

      expect(screen.getByText("Application")).toBeInTheDocument();
      expect(screen.getByText("Operating System")).toBeInTheDocument();
      expect(screen.getByText("Links")).toBeInTheDocument();
      expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
      expect(screen.getByText("NodeTool Forum")).toBeInTheDocument();
      expect(screen.getByText("Website")).toBeInTheDocument();
    });
  });
});
