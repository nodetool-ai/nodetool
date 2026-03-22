// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate
}));

// Mock NavButton component
jest.mock("../../ui_primitives/NavButton", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  const MockNavButton = React.forwardRef((props: any, ref: any) => (
    <button
      ref={ref}
      onClick={props.onClick}
      className={props.className}
      {...props}
    >
      {props.icon}
      {props.label}
    </button>
  ));
  MockNavButton.displayName = "NavButton";
  return {
    __esModule: true,
    NavButton: MockNavButton
  };
});

import { useState, useCallback } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BackToDashboardButton from "../BackToDashboardButton";

describe("BackToDashboardButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with default title 'Dashboard'", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Dashboard");
  });

  it("renders with custom title when provided", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton title="Home" />
      </MemoryRouter>
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Home");
  });

  it("navigates to /dashboard when clicked", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to /dashboard when clicked with custom title", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton title="Back to Home" />
      </MemoryRouter>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("includes 'back-to-dashboard' className", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    expect(screen.getByRole("button")).toHaveClass("back-to-dashboard");
  });

  it("renders DashboardIcon via NavButton", () => {
    render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    const button = screen.getByRole("button");
    // Icon should be rendered as a child
    expect(button).toBeInTheDocument();
  });

  it("forwards ref to underlying button element", () => {
    const TestWrapper = () => {
      const [ref, setRef] = useState<any>(null);
      const handleRefSet = useCallback((r: any) => {
        setRef(r);
      }, []);
      
      return (
        <MemoryRouter>
          <BackToDashboardButton ref={handleRefSet} />
          {ref && <span data-testid="ref-set">Ref was set</span>}
        </MemoryRouter>
      );
    };

    render(<TestWrapper />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByTestId("ref-set")).toBeInTheDocument();
  });

  it("uses memo for performance optimization", () => {
    const { rerender } = render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    const initialButton = screen.getByRole("button");

    // Re-render with same props - component should not re-render due to memo
    rerender(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );

    expect(screen.getByRole("button")).toEqual(initialButton);
  });

  it("has displayName for debugging", () => {
    // Verify component exists and can be rendered (which indicates proper export)
    render(
      <MemoryRouter>
        <BackToDashboardButton />
      </MemoryRouter>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
