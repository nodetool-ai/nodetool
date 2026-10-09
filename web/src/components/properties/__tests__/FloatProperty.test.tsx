import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import React from "react";
import { screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";
import FloatProperty from "../FloatProperty";

const { render } = nodeStoreRenderers(
  makeNodeStore({ nodes: [] }, { pause: jest.fn(), resume: jest.fn() })
);
const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("FloatProperty", () => {
  const mockOnChange = jest.fn();

  const createMockProperty = (overrides = {}) => ({
    name: "test_float",
    type: { type: "float", optional: false, values: null, type_args: [], type_name: null },
    default: 0.0,
    title: "Test Float",
    description: "A test float property",
    required: false,
    ...overrides,
  });

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("should show slider when min and max are provided", () => {
    const property = createMockProperty({ min: 0, max: 100 });
    renderWithTheme(
      <FloatProperty
        property={property as any}
        value={50.5}
        nodeType="nodetool.input.FloatInput"
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
      <FloatProperty
        property={property as any}
        value={50.5}
        nodeType="nodetool.input.FloatInput"
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
      <FloatProperty
        property={property as any}
        value={50.5}
        nodeType="nodetool.input.FloatInput"
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
      <FloatProperty
        property={property as any}
        value={50.5}
        nodeType="nodetool.input.FloatInput"
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
      <FloatProperty
        property={property as any}
        value={50.5}
        nodeType="nodetool.input.FloatInput"
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
      <FloatProperty
        property={property as any}
        value={3.14}
        nodeType="nodetool.input.FloatInput"
        nodeId="test-node"
        propertyIndex="0"
        onChange={mockOnChange}
      />
    );
    expect(screen.getByDisplayValue("3.14")).toBeInTheDocument();
  });

  it("should use min/max from the input node's properties", () => {
    const node = {
      id: "test-node",
      data: { properties: { min: 1.5, max: 99.9 } }
    };
    const store = makeNodeStore({
      nodes: [node],
      findNode: (id: string) => (id === node.id ? node : undefined)
    });
    const { render: renderInStore } = nodeStoreRenderers(store);
    renderInStore(
      <ThemeProvider theme={mockTheme}>
        <FloatProperty
          property={createMockProperty({ name: "value", min: null, max: null }) as unknown as Property}
          value={50.5}
          nodeType="nodetool.input.FloatInput"
          nodeId="test-node"
          propertyIndex="0"
          onChange={mockOnChange}
        />
      </ThemeProvider>
    );
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });
});
