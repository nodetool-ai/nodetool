import React from "react";
import { render, screen } from "@testing-library/react";
import type { Property } from "../../../stores/ApiTypes";
import DictProperty from "../DictProperty";

jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../inputs/Select", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../node/DataTable/DictTable", () => ({
  __esModule: true,
  default: ({ data_type }: { data_type: string }) => (
    <div data-testid="dict-table" data-type={data_type} />
  )
}));

const property = {
  name: "value",
  type: { type: "dict", optional: false, type_args: [] }
} as unknown as Property;

const renderDict = (value: Record<string, string | number>) =>
  render(
    <DictProperty
      property={property}
      propertyIndex="0"
      value={value}
      onChange={jest.fn()}
      nodeId="n1"
      nodeType="nodetool.constant.Dict"
    />
  );

describe("DictProperty", () => {
  it.each([
    [{ a: 1 }, "int"],
    [{ a: 1.5 }, "float"],
    [{ a: "x" }, "string"],
    [{}, "string"]
  ])("detects the value type of %j as %s", (value, expected) => {
    renderDict(value);
    expect(screen.getByTestId("dict-table")).toHaveAttribute(
      "data-type",
      expected
    );
  });
});
