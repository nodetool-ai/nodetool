import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";
import JSONProperty from "../JSONProperty";

// Stub Monaco with a textarea so the editor can be driven without the real bundle.
jest.mock("../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: ({
      value,
      onChange
    }: {
      value: string;
      onChange?: (val?: string) => void;
    }) => (
      <textarea
        data-testid="monaco"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: jest.fn().mockResolvedValue(undefined),
    monacoOnMount: jest.fn()
  })
}));

const property = {
  name: "config",
  description: "Settings",
  type: { type: "json", optional: false, type_args: [] }
} as unknown as Property;

const renderJson = (data: string) => (
  <ThemeProvider theme={mockTheme}>
    <JSONProperty
      property={property}
      propertyIndex="0"
      value={{ type: "json", data }}
      onChange={jest.fn()}
      nodeId="node1"
      nodeType="nodetool.constant.JSON"
    />
  </ThemeProvider>
);

describe("JSONProperty", () => {
  it("shows a value written from outside the editor, such as an undo", () => {
    const { rerender } = render(renderJson('{"a": 1}'));
    expect(screen.getByTestId("monaco")).toHaveValue('{"a": 1}');

    rerender(renderJson('{"a": 2}'));

    expect(screen.getByTestId("monaco")).toHaveValue('{"a": 2}');
  });
});
