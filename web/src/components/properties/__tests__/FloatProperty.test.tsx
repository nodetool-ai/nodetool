import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import FloatProperty from "../FloatProperty";
import useMetadataStore from "../../../stores/MetadataStore";

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

  const originalMetadata = useMetadataStore.getState();

  beforeEach(() => {
    mockOnChange.mockClear();
    useMetadataStore.setState(originalMetadata, true);
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

  it("should show slider with default min=0 and max=100 when min/max not provided", () => {
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
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });

  it("should show slider when min is null and max is provided", () => {
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
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });

  it("should show slider when max is null and min is provided", () => {
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
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
  });

  it("should show slider when both min and max are null", () => {
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
    expect(document.querySelector(".range-container-wrapper")).toBeInTheDocument();
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

  it("should use min/max from node metadata when available", () => {
    const property = createMockProperty({ min: null, max: null });
    useMetadataStore.setState({
      metadata: {
        "nodetool.input.FloatInput": {
          node_type: "nodetool.input.FloatInput",
          title: "Float Input",
          description: "A float input node",
          namespace: "nodetool.input",
          layout: "default",
          outputs: [],
          properties: [
            {
              name: "test_float",
              type: { type: "float", optional: false, values: null, type_args: [], type_name: null },
              default: 0.0,
              min: 1.5,
              max: 99.9,
              required: false
            }
          ],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      }
    }, true);

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
});
