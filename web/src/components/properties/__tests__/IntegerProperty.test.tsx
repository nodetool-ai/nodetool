import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";
import IntegerProperty from "../IntegerProperty";

const { render } = nodeStoreRenderers(
  makeNodeStore({ nodes: [] }, { pause: jest.fn(), resume: jest.fn() })
);
const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("IntegerProperty", () => {
  const mockOnChange = jest.fn();

  const createMockProperty = (overrides = {}) => ({
    name: "test_int",
    type: { type: "int", optional: false, values: null, type_args: [], type_name: null },
    default: 0,
    title: "Test Integer",
    description: "A test integer property",
    required: false,
    ...overrides,
  });

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("should show slider when min and max are provided", () => {
    const property = createMockProperty({ min: 0, max: 100 });
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={50}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });

  it("should hide the slider when min/max are not provided", () => {
    const property = createMockProperty();
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={50}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(document.querySelector(".range-container-wrapper")).not.toBeInTheDocument();
  });

  it("should hide the slider when only max is provided", () => {
    const property = createMockProperty({ min: null, max: 100 });
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={50}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(document.querySelector(".range-container-wrapper")).not.toBeInTheDocument();
  });

  it("should hide the slider when only min is provided", () => {
    const property = createMockProperty({ min: 0, max: null });
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={50}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(document.querySelector(".range-container-wrapper")).not.toBeInTheDocument();
  });

  it("should hide the slider when both min and max are null", () => {
    const property = createMockProperty({ min: null, max: null });
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={50}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(document.querySelector(".range-container-wrapper")).not.toBeInTheDocument();
  });

  it("should display the correct value in the input", () => {
    const property = createMockProperty({ min: 0, max: 100 });
    renderWithTheme(
      <IntegerProperty
        property={property as any}
        value={42}
        nodeType="nodetool.input.IntegerInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
  });

  it("should use min/max from the input node's properties", () => {
    const node = {
      id: "test-node",
      data: { properties: { min: 10, max: 50 } }
    };
    const store = makeNodeStore({
      nodes: [node],
      findNode: (id: string) => (id === node.id ? node : undefined)
    });
    const { render: renderInStore } = nodeStoreRenderers(store);
    renderInStore(
      <ThemeProvider theme={mockTheme}>
        <IntegerProperty
          property={createMockProperty({ name: "value", min: null, max: null }) as unknown as Property}
          value={30}
          nodeType="nodetool.input.IntegerInput"
          nodeId="test-node"
          propertyIndex="0"
          onChange={mockOnChange}
        />
      </ThemeProvider>
    );
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });

  it("keeps a -1 sentinel when no bounds are declared", () => {
    renderWithTheme(
      <IntegerProperty
        property={createMockProperty({ name: "limit" }) as unknown as Property}
        value={-1}
        nodeType="nodetool.control.ForEach"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    const input = screen.getByDisplayValue("-1");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.blur(input);
    expect(mockOnChange).toHaveBeenLastCalledWith(-1);
  });
});
