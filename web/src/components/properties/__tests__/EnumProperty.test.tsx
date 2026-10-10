import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Property } from "../../../stores/ApiTypes";
import EnumProperty from "../EnumProperty";

jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../inputs/Select", () => ({
  __esModule: true,
  default: ({
    value,
    options,
    onChange
  }: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <div>
      <span data-testid="selected">
        {options.find((option) => option.value === value)?.label ?? "Select…"}
      </span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}));

const intEnum = {
  name: "scale",
  type: {
    type: "enum",
    optional: false,
    values: [0, 2, 4],
    type_args: []
  },
  required: false
} as unknown as Property;

describe("EnumProperty", () => {
  it("shows a numeric value as selected, including 0", () => {
    const { rerender } = render(
      <EnumProperty
        property={intEnum}
        value={2}
        nodeType="nodetool.image.Upscale"
        nodeId="n1"
        propertyIndex="0"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId("selected")).toHaveTextContent("2");

    rerender(
      <EnumProperty
        property={intEnum}
        value={0}
        nodeType="nodetool.image.Upscale"
        nodeId="n1"
        propertyIndex="0"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId("selected")).toHaveTextContent("0");
  });

  it("writes the declared numeric value, not its string", () => {
    const onChange = jest.fn();
    render(
      <EnumProperty
        property={intEnum}
        value={2}
        nodeType="nodetool.image.Upscale"
        nodeId="n1"
        propertyIndex="0"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
