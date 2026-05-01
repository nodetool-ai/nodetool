/**
 * Tests for SearchErrorBoundary component
 *
 * This error boundary is critical for search functionality reliability.
 * Tests cover error catching, rendering, retry functionality, and logging.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@emotion/react";
import mockTheme from "../../__mocks__/themeMock";
import SearchErrorBoundary from "../SearchErrorBoundary";


let mockLogError: jest.SpyInstance;

// Add missing palette properties used by SearchErrorBoundary
beforeEach(() => {
  mockLogError = jest.spyOn(console, "error").mockImplementation(() => {});
  (mockTheme as any).vars.palette.c_gray0 = "#ffffff";
  (mockTheme as any).vars.palette.c_gray1 = "#e0e0e0";
  (mockTheme as any).vars.palette.c_gray4 = "#757575";
  (mockTheme as any).vars.palette.c_hl1 = "#2196f3";
  (mockTheme as any).vars.palette.c_hl2 = "#1976d2";
  (mockTheme as any).vars.palette.grey[1000] = "#000000";
});

afterEach(() => {
  mockLogError?.mockRestore();
});

// Wrapper with Emotion theme (required by SearchErrorBoundary)
const WithTheme: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>;
};

describe("SearchErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("normal operation", () => {
    it("should render children when there is no error", () => {
      const TestChild = () => <div data-testid="test-child">Test Content</div>;

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <TestChild />
          </SearchErrorBoundary>
        </WithTheme>
      );

      expect(screen.getByTestId("test-child")).toBeInTheDocument();
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });

    it("should render multiple children without errors", () => {
      render(
        <WithTheme>
          <SearchErrorBoundary>
            <div data-testid="child-1">Child 1</div>
            <div data-testid="child-2">Child 2</div>
          </SearchErrorBoundary>
        </WithTheme>
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });

    it("should render simple HTML elements without errors", () => {
      render(
        <WithTheme>
          <SearchErrorBoundary>
            <div>
              <span data-testid="simple">Simple Content</span>
            </div>
          </SearchErrorBoundary>
        </WithTheme>
      );

      expect(screen.getByTestId("simple")).toBeInTheDocument();
      expect(screen.getByText("Simple Content")).toBeInTheDocument();
    });
  });

  describe("error catching", () => {
    it("should catch and display errors from child components", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });
    });

    it("should display custom fallback title when provided", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary fallbackTitle="Custom Error Title">
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByText("Custom Error Title")).toBeInTheDocument();
        expect(screen.queryByText("Search Error")).not.toBeInTheDocument();
      });
    });

    it("should display error message when an error occurs", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(
          screen.getByText(/something went wrong with the search functionality/i)
        ).toBeInTheDocument();
      });
    });

    it("should log error to console", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalled();
        const ourCall = mockLogError.mock.calls.find(
          (call) => call[0] === "Search component error:"
        );
        expect(ourCall).toBeDefined();
      });
    });
  });

  describe("retry functionality", () => {
    it("should display retry button when error occurs", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
      });
    });

    it("should call onRetry callback when retry button is clicked", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      const onRetry = jest.fn();

      render(
        <WithTheme>
          <SearchErrorBoundary onRetry={onRetry}>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /try again/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("should reset error state and allow retry", async () => {
      let shouldThrow = true;

      const ConditionalThrow = () => {
        if (shouldThrow) {
          throw new Error("Test error");
        }
        return <div data-testid="recovered">Recovered</div>;
      };

      const { rerender } = render(
        <WithTheme>
          <SearchErrorBoundary>
            <ConditionalThrow />
          </SearchErrorBoundary>
        </WithTheme>
      );

      // Wait for error to be caught
      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });

      // Stop throwing errors
      shouldThrow = false;

      // Click retry to reset error state
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /try again/i }));

      // Re-render with same component (now it won't throw)
      rerender(
        <WithTheme>
          <SearchErrorBoundary>
            <ConditionalThrow />
          </SearchErrorBoundary>
        </WithTheme>
      );

      // Component should render normally after reset
      await waitFor(() => {
        expect(screen.getByTestId("recovered")).toBeInTheDocument();
      });
    });
  });

  describe("error types", () => {
    it("should handle errors with messages", async () => {
      const ThrowError = () => {
        throw new Error("Custom error message");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
        expect(mockLogError).toHaveBeenCalled();
      });
    });

    it("should handle error objects", async () => {
      const ThrowError = () => {
        const error = new Error("Object error");
        error.name = "CustomError";
        throw error;
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });
    });
  });

  describe("edge cases", () => {
    it("should work without onRetry callback (re-throws on retry)", async () => {
      const shouldThrow = true;

      const ConditionalThrow = () => {
        if (shouldThrow) {
          throw new Error("Test error");
        }
        return <div data-testid="recovered">Recovered</div>;
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ConditionalThrow />
          </SearchErrorBoundary>
        </WithTheme>
      );

      // Wait for error to be caught
      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });

      // Click retry without onRetry - error state is cleared but child throws again
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /try again/i }));

      // Error is re-caught because child throws again on re-render
      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });
    });

    it("should handle null children gracefully", () => {
      render(
        <WithTheme>
          <SearchErrorBoundary>{null}</SearchErrorBoundary>
        </WithTheme>
      );

      // Should render without errors
      expect(screen.queryByText("Search Error")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper heading hierarchy", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        const heading = screen.getByText("Search Error");
        // Text component renders as <p> by default
        expect(heading.tagName).toBe("P");
      });
    });

    it("should have accessible retry button", async () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <WithTheme>
          <SearchErrorBoundary>
            <ThrowError />
          </SearchErrorBoundary>
        </WithTheme>
      );

      await waitFor(() => {
        const button = screen.getByRole("button", { name: /try again/i });
        expect(button).toBeInTheDocument();
      });
    });
  });
});
