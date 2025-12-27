import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HandleTooltip from "../../components/HandleTooltip";
import { TypeMetadata } from "../../stores/ApiTypes";

// Mock dependencies
jest.mock("../../config/data_types", () => ({
  colorForType: (type: string) => {
    const colors: Record<string, string> = {
      str: "#4CAF50",
      int: "#2196F3",
      float: "#FF9800",
      bool: "#9C27B0"
    };
    return colors[type] || "#757575";
  },
  textColorForType: (type: string) => "#FFFFFF"
}));

jest.mock("../../utils/TypeHandler", () => ({
  typeToString: (typeMetadata: TypeMetadata) => {
    if (typeMetadata.type === "union" && typeMetadata.type_args) {
      return typeMetadata.type_args.map((t) => t.type).join(" | ");
    }
    return typeMetadata.type;
  }
}));

jest.mock("../../utils/MousePosition", () => ({
  getMousePosition: () => ({ x: 100, y: 200 })
}));

describe("HandleTooltip", () => {
  const mockTypeMetadata: TypeMetadata = {
    type: "str",
    optional: false,
    values: null,
    type_args: [],
    type_name: null
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("renders children without tooltip initially", () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Child content</div>
      </HandleTooltip>
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(screen.queryByText("Test Param")).not.toBeInTheDocument();
  });

  it("shows tooltip after delay on mouse enter", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    expect(wrapper).toBeInTheDocument();

    await userEvent.hover(wrapper!);

    // Tooltip should not show immediately
    expect(screen.queryByText("Test Param")).not.toBeInTheDocument();

    // Fast-forward time to trigger tooltip
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("Test Param")).toBeInTheDocument();
    });
  });

  it("hides tooltip on mouse leave", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("Test Param")).toBeInTheDocument();
    });

    await userEvent.unhover(wrapper!);

    await waitFor(() => {
      expect(screen.queryByText("Test Param")).not.toBeInTheDocument();
    });
  });

  it("cancels tooltip if mouse leaves before delay", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);

    // Leave before delay completes
    jest.advanceTimersByTime(300);
    await userEvent.unhover(wrapper!);

    // Complete remaining time
    jest.advanceTimersByTime(300);

    expect(screen.queryByText("Test Param")).not.toBeInTheDocument();
  });

  it("formats parameter name correctly", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="my_long_param_name"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("My Long Param Name")).toBeInTheDocument();
    });
  });

  it("displays type metadata", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("str")).toBeInTheDocument();
    });
  });

  it("displays 'number' for float|int union type", async () => {
    const unionTypeMetadata: TypeMetadata = {
      type: "union",
      optional: false,
      values: null,
      type_args: [
        { type: "float", optional: false, values: null, type_args: [], type_name: null },
        { type: "int", optional: false, values: null, type_args: [], type_name: null }
      ],
      type_name: null
    };

    render(
      <HandleTooltip
        typeMetadata={unionTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("number")).toBeInTheDocument();
    });
  });

  it("displays 'number' for int|float union type (reversed order)", async () => {
    const unionTypeMetadata: TypeMetadata = {
      type: "union",
      optional: false,
      values: null,
      type_args: [
        { type: "int", optional: false, values: null, type_args: [], type_name: null },
        { type: "float", optional: false, values: null, type_args: [], type_name: null }
      ],
      type_name: null
    };

    render(
      <HandleTooltip
        typeMetadata={unionTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText("number")).toBeInTheDocument();
    });
  });

  it("applies custom className", () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        className="custom-class"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    expect(wrapper).toHaveClass("handle-tooltip-wrapper");
    expect(wrapper).toHaveClass("custom-class");
  });

  it("positions tooltip for left handle", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="left"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      const tooltip = screen.getByText("Test Param").closest(".handle-tooltip");
      expect(tooltip).toHaveStyle({ left: "100px", top: "200px" });
    });
  });

  it("positions tooltip for right handle", async () => {
    render(
      <HandleTooltip
        typeMetadata={mockTypeMetadata}
        paramName="test_param"
        handlePosition="right"
      >
        <div>Hover me</div>
      </HandleTooltip>
    );

    const wrapper = screen.getByText("Hover me").parentElement;
    await userEvent.hover(wrapper!);
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      const tooltip = screen.getByText("Test Param").closest(".handle-tooltip");
      expect(tooltip).toHaveStyle({ left: "100px", top: "200px" });
    });
  });
});
