import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { NotificationBadge } from "../NotificationBadge";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI Badge component
jest.mock("@mui/material/Badge", () => ({
  __esModule: true,
  default: ({
    children,
    badgeContent,
    max,
    color,
    showZero,
    variant,
    invisible,
    anchorOrigin,
    className
  }: any) => (
    <div
      data-testid="badge"
      data-badge-content={badgeContent}
      data-max={max}
      data-color={color}
      data-show-zero={showZero}
      data-variant={variant}
      data-invisible={invisible}
      data-anchor-vertical={anchorOrigin?.vertical}
      data-anchor-horizontal={anchorOrigin?.horizontal}
      className={className}
    >
      {children}
    </div>
  )
}));

// Get the actual badge element which has the className
const getBadgeElement = () => screen.getByTestId("badge");

// Mock Tooltip
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-tooltip={typeof title === "string" ? title : "tooltip"}>
      {children}
    </div>
  )
}));

describe("NotificationBadge", () => {
  const defaultChild = <button data-testid="child-button">Test Button</button>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with default props", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    expect(screen.getByTestId("child-button")).toBeInTheDocument();
  });

  it("renders with count of 0 and default behavior (invisible)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={0}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-badge-content", "0");
    expect(badge).toHaveAttribute("data-invisible", "true");
  });

  it("renders with count of 0 when showZero is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={0} showZero={true}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-badge-content", "0");
    expect(badge).toHaveAttribute("data-show-zero", "true");
    expect(badge).toHaveAttribute("data-invisible", "false");
  });

  it("renders with positive count", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={42}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-badge-content", "42");
    expect(badge).toHaveAttribute("data-invisible", "false");
  });

  it("renders with count greater than max", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={150} max={99}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-max", "99");
  });

  it("renders with custom max value", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={50} max={25}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-max", "25");
  });

  it("renders with default max value of 99", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={100}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-max", "99");
  });

  it("renders with error color (default)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "error");
  });

  it("renders with primary color", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} color="primary">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "primary");
  });

  it("renders with secondary color", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} color="secondary">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "secondary");
  });

  it("renders with info color", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} color="info">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "info");
  });

  it("renders with success color", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} color="success">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "success");
  });

  it("renders with warning color", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} color="warning">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("data-color", "warning");
  });

  it("renders in dot variant", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} dot={true}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "dot");
    // Dot variant should not have badgeContent
    expect(badge).not.toHaveAttribute("data-badge-content");
  });

  it("renders with default anchor origin (top-right)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-anchor-vertical", "top");
    expect(badge).toHaveAttribute("data-anchor-horizontal", "right");
  });

  it("renders with custom anchor origin (top-left)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge
          count={5}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
        >
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-anchor-vertical", "top");
    expect(badge).toHaveAttribute("data-anchor-horizontal", "left");
  });

  it("renders with custom anchor origin (bottom-right)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge
          count={5}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-anchor-vertical", "bottom");
    expect(badge).toHaveAttribute("data-anchor-horizontal", "right");
  });

  it("renders with custom anchor origin (bottom-left)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge
          count={5}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-anchor-vertical", "bottom");
    expect(badge).toHaveAttribute("data-anchor-horizontal", "left");
  });

  it("renders with tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} tooltip="5 new notifications">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    // Tooltip is rendered as a wrapper with data-tooltip attribute
    const container = screen.getByTestId("badge").parentElement;
    expect(container).toHaveAttribute("data-tooltip", "5 new notifications");
  });

  it("renders without tooltip when not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    // Without tooltip, badge parent should not have data-tooltip attribute
    const container = screen.getByTestId("badge").parentElement;
    expect(container?.getAttribute("data-tooltip")).toBeNull();
  });

  it("renders with small size", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} size="small">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveClass("small");
  });

  it("renders with medium size (default)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} size="medium">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveClass("medium");
    expect(badge.classList.contains("small")).toBe(false);
  });

  it("renders with animation enabled (default)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} animate={true}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("renders without animation when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} animate={false}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("renders with custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} className="custom-badge-class">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const wrapper = screen.getByTestId("badge").parentElement;
    expect(wrapper).toHaveClass("custom-badge-class");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const wrapper = screen.getByTestId("badge").parentElement;
    expect(wrapper).toHaveClass("nodrag");
  });

  it("wraps children in notification-badge-wrapper div", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const wrapper = screen.getByTestId("badge").parentElement;
    expect(wrapper).toHaveClass("notification-badge-wrapper");
  });

  it("renders with dot variant and applies dot class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} dot={true}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveClass("dot");
  });

  it("renders with multiple children", () => {
    const multipleChildren = (
      <div>
        <span data-testid="child1">Child 1</span>
        <span data-testid="child2">Child 2</span>
      </div>
    );
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{multipleChildren}</NotificationBadge>
      </ThemeProvider>
    );
    expect(screen.getByTestId("child1")).toBeInTheDocument();
    expect(screen.getByTestId("child2")).toBeInTheDocument();
  });

  it("renders tooltip with tooltip enter delay (TOOLTIP_ENTER_DELAY constant)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} tooltip="Test tooltip">
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    // Tooltip should be rendered when tooltip prop is provided
    const container = screen.getByTestId("badge").parentElement;
    expect(container).toHaveAttribute("data-tooltip", "Test tooltip");
  });

  it("handles large count values correctly", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={9999}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-badge-content", "9999");
  });

  it("standard variant is used when dot is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5} dot={false}>
          {defaultChild}
        </NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "standard");
  });

  it("badge has notification-badge class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NotificationBadge count={5}>{defaultChild}</NotificationBadge>
      </ThemeProvider>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveClass("notification-badge");
  });
});
