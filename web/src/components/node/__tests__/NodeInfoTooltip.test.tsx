import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NodeInfoTooltip } from "../NodeInfoTooltip";
import { NodeMetadata } from "../../../stores/ApiTypes";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("NodeInfoTooltip", () => {
  const defaultProps = {
    metadata: {
      title: "Test Node",
      description: "This is a test node for testing purposes",
      namespace: "nodetool.test",
      properties: [
        { name: "input1", type: { type: "string" } },
        { name: "input2", type: { type: "number" } }
      ],
      outputs: [
        { name: "output1", type: { type: "image" } }
      ]
    } as NodeMetadata,
    nodeType: "nodetool.test.test_node",
    children: <button>Info</button>
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render tooltip trigger button", () => {
    renderWithTheme(<NodeInfoTooltip {...defaultProps} />);

    const button = screen.getByText("Info");
    expect(button).toBeInTheDocument();
  });

  it("should handle children rendering", () => {
    const customChild = <span data-testid="custom-child">Custom Child</span>;
    renderWithTheme(
      <NodeInfoTooltip {...defaultProps}>
        {customChild}
      </NodeInfoTooltip>
    );

    const child = screen.getByTestId("custom-child");
    expect(child).toBeInTheDocument();
  });

  it("should render without errors with minimal metadata", () => {
    const propsWithMinimalMetadata = {
      metadata: {
        title: "Minimal Node"
      } as NodeMetadata,
      nodeType: "nodetool.test.minimal",
      children: <button>Minimal</button>
    };

    expect(() => {
      renderWithTheme(<NodeInfoTooltip {...propsWithMinimalMetadata} />);
    }).not.toThrow();
  });

  it("should handle missing description", () => {
    const propsWithoutDescription = {
      metadata: {
        title: "Node Without Description",
        namespace: "nodetool.test"
      } as NodeMetadata,
      nodeType: "nodetool.test.no_desc",
      children: <button>No Desc</button>
    };

    renderWithTheme(<NodeInfoTooltip {...propsWithoutDescription} />);

    const button = screen.getByText("No Desc");
    expect(button).toBeInTheDocument();
  });

  it("should handle empty properties and outputs", () => {
    const propsWithEmptyTypes = {
      metadata: {
        title: "Empty Types Node",
        description: "Node with no inputs or outputs",
        namespace: "nodetool.test",
        properties: [] as Array<{ name: string; type: { type: string } }>,
        outputs: [] as Array<{ name: string; type: { type: string } }>,
        node_type: "nodetool.test.empty_types",
        layout: "singleton" as const
      } as NodeMetadata,
      nodeType: "nodetool.test.empty_types",
      children: <button>Empty</button>
    };

    renderWithTheme(<NodeInfoTooltip {...propsWithEmptyTypes} />);

    const button = screen.getByText("Empty");
    expect(button).toBeInTheDocument();
  });

  it("should handle placement prop", () => {
    const propsWithPlacement = {
      ...defaultProps,
      placement: "bottom" as const,
      children: <button>Bottom</button>
    };

    renderWithTheme(<NodeInfoTooltip {...propsWithPlacement} />);

    const button = screen.getByText("Bottom");
    expect(button).toBeInTheDocument();
  });

  it("should handle custom sx prop", () => {
    const propsWithSx = {
      ...defaultProps,
      sx: { mt: 2 } as const,
      children: <button>Styled</button>
    };

    renderWithTheme(<NodeInfoTooltip {...propsWithSx} />);

    const button = screen.getByText("Styled");
    expect(button).toBeInTheDocument();
  });

  it("should render with long description", () => {
    const longDescription = "A".repeat(200);
    const propsWithLongDesc = {
      metadata: {
        title: "Long Description Node",
        description: longDescription,
        namespace: "nodetool.test"
      } as NodeMetadata,
      nodeType: "nodetool.test.long",
      children: <button>Long</button>
    };

    expect(() => {
      renderWithTheme(<NodeInfoTooltip {...propsWithLongDesc} />);
    }).not.toThrow();
  });

  it("should handle node with many inputs and outputs", () => {
    const manyInputsOutputs = {
      metadata: {
        title: "Many Types Node",
        description: "Node with many inputs and outputs",
        namespace: "nodetool.test",
        properties: [
          { name: "input1", type: { type: "type1" } },
          { name: "input2", type: { type: "type2" } },
          { name: "input3", type: { type: "type3" } },
          { name: "input4", type: { type: "type4" } }
        ],
        outputs: [
          { name: "output1", type: { type: "typeA" } },
          { name: "output2", type: { type: "typeB" } },
          { name: "output3", type: { type: "typeC" } },
          { name: "output4", type: { type: "typeD" } }
        ]
      } as NodeMetadata,
      nodeType: "nodetool.test.many_types",
      children: <button>Many</button>
    };

    expect(() => {
      renderWithTheme(<NodeInfoTooltip {...manyInputsOutputs} />);
    }).not.toThrow();
  });

  it("should handle node with usage tip in description", () => {
    const propsWithTip = {
      metadata: {
        title: "Node With Tip",
        description: "This node processes images. Tip: Use smaller images for better performance.",
        namespace: "nodetool.test"
      } as NodeMetadata,
      nodeType: "nodetool.test.with_tip",
      children: <button>Tip</button>
    };

    expect(() => {
      renderWithTheme(<NodeInfoTooltip {...propsWithTip} />);
    }).not.toThrow();
  });
});
