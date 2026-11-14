import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";
import type { PropertyProps } from "../../node/PropertyInput";

const mockGetComponentForProperty = jest.fn();

jest.mock("../../node/PropertyInput.resolver", () => ({
  getComponentForProperty: (...args: unknown[]) =>
    mockGetComponentForProperty(...args)
}));

import { ChainNodeProperties } from "../ChainNodeProperties";

const codeProperty = {
  name: "code",
  type: { type: "str", type_args: [], optional: false },
  default: "",
  description: "",
  required: false
} as Property;

describe("ChainNodeProperties code field", () => {
  it("resolves field editors with the node type, so a Code node's code gets the code editor", () => {
    const CodeEditorStub = ({ nodeType }: PropertyProps) => (
      <div data-testid="field-editor">{nodeType}</div>
    );
    mockGetComponentForProperty.mockReturnValue(CodeEditorStub);

    render(
      <ThemeProvider theme={mockTheme}>
        <ChainNodeProperties
          nodeId="n1"
          nodeType="nodetool.code.Code"
          properties={[codeProperty]}
          values={{ code: "return 1;" }}
          inputMappings={{}}
          previousNodes={[]}
          onUpdate={jest.fn()}
          onSetInputMapping={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(mockGetComponentForProperty).toHaveBeenCalledWith(
      codeProperty,
      "nodetool.code.Code"
    );
    expect(screen.getByTestId("field-editor").textContent).toBe(
      "nodetool.code.Code"
    );
  });
});
