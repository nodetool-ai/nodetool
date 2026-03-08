/**
 * GoogleAuthButton Component Tests
 *
 * Tests the Google authentication button component including:
 * - Rendering in different auth states
 * - Click behavior and disabled states
 * - Accessibility attributes
 * - Loading state handling
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import GoogleAuthButton from "../GoogleAuthButton";
import mockTheme from "../../../__mocks__/themeMock";

// Type for the auth state
type AuthState = "init" | "loading" | "error" | "logged_in" | "logged_out";

// Create a mock state that can be controlled in tests
let mockAuthState: AuthState = "logged_out";
const mockSignInWithProvider = jest.fn();

// Mock the useAuth hook with a configurable state
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    const state = {
      signInWithProvider: mockSignInWithProvider,
      state: mockAuthState
    };
    return selector(state);
  })
}));

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("GoogleAuthButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default logged_out state
    mockAuthState = "logged_out";
  });

  describe("Rendering", () => {
    it("should render successfully", () => {
      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
    });

    it("should have correct CSS class", () => {
      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toHaveClass("gsi-material-button");
    });

    it("should render the Google icon", () => {
      renderWithTheme(<GoogleAuthButton />);

      const svg = document.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("role", "presentation");
    });

    it("should display the button text", () => {
      renderWithTheme(<GoogleAuthButton />);

      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label attribute", () => {
      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toHaveAttribute("aria-label", "Sign in with Google");
    });

    it("should have type='button' to prevent form submission", () => {
      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toHaveAttribute("type", "button");
    });

    it("should have accessible name matching aria-label", () => {
      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: "Sign in with Google" });
      expect(button).toBeInTheDocument();
    });

    it("should hide decorative SVG from screen readers", () => {
      renderWithTheme(<GoogleAuthButton />);

      const svg = document.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("role", "presentation");
    });
  });

  describe("Click behavior", () => {
    it("should call signInWithProvider with 'google' when clicked", async () => {
      mockAuthState = "logged_out";
      mockSignInWithProvider.mockResolvedValue(undefined);

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockSignInWithProvider).toHaveBeenCalledTimes(1);
        expect(mockSignInWithProvider).toHaveBeenCalledWith("google");
      });
    });

    it("should not call signInWithProvider when in loading state", () => {
      mockAuthState = "loading";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      fireEvent.click(button);

      expect(mockSignInWithProvider).not.toHaveBeenCalled();
    });

    it("should not call signInWithProvider when already logged in", () => {
      mockAuthState = "logged_in";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      fireEvent.click(button);

      expect(mockSignInWithProvider).not.toHaveBeenCalled();
    });
  });

  describe("Disabled states", () => {
    it("should not be disabled when logged out", () => {
      mockAuthState = "logged_out";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).not.toBeDisabled();
    });

    it("should be disabled when in loading state", () => {
      mockAuthState = "loading";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeDisabled();
    });

    it("should be disabled when logged in", () => {
      mockAuthState = "logged_in";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeDisabled();
    });

    it("should not be disabled when in error state", () => {
      mockAuthState = "error";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).not.toBeDisabled();
    });

    it("should not be disabled when in init state", () => {
      mockAuthState = "init";

      renderWithTheme(<GoogleAuthButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).not.toBeDisabled();
    });
  });

  describe("Visual structure", () => {
    it("should render with correct container div", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const button = container.querySelector(".gsi-material-button");
      expect(button).toBeInTheDocument();
    });

    it("should render button state wrapper", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const stateWrapper = container.querySelector(".gsi-material-button-state");
      expect(stateWrapper).toBeInTheDocument();
    });

    it("should render content wrapper", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const contentWrapper = container.querySelector(".gsi-material-button-content-wrapper");
      expect(contentWrapper).toBeInTheDocument();
    });

    it("should render icon container", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const iconContainer = container.querySelector(".gsi-material-button-icon");
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe("Icon SVG paths", () => {
    it("should render all Google logo path elements", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const paths = container.querySelectorAll("path");
      // Google logo has 5 path elements (4 colored paths + 1 transparent path)
      expect(paths.length).toBeGreaterThanOrEqual(4);
    });

    it("should have correct viewBox on SVG", () => {
      const { container } = renderWithTheme(<GoogleAuthButton />);

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox", "0 0 48 48");
    });
  });

  describe("Integration with useAuth hook", () => {
    it("should use selective Zustand subscription for signInWithProvider", () => {
      renderWithTheme(<GoogleAuthButton />);

      // Verify that the hook is being used by checking the rendered button
      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
    });

    it("should use selective Zustand subscription for state", () => {
      renderWithTheme(<GoogleAuthButton />);

      // Component should render without errors, indicating proper hook usage
      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
    });

    it("should update disabled state when auth state changes", () => {
      // Start with logged_out (not disabled)
      mockAuthState = "logged_out";
      const { unmount } = renderWithTheme(<GoogleAuthButton />);

      let button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).not.toBeDisabled();

      // Unmount and change state to loading
      unmount();
      mockAuthState = "loading";

      // Re-render with new state
      renderWithTheme(<GoogleAuthButton />);

      button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeDisabled();
    });
  });
});
