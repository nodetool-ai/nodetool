import { render, screen } from "@testing-library/react";
import ImageProperty from "../ImageProperty";
import type { PropertyProps } from "../../node/PropertyInput.types";

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: undefined, uri: undefined })
}));
jest.mock("../PropertyDropzone", () => ({
  __esModule: true,
  default: () => <div>Upload product image</div>
}));
jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: () => null
}));

it("renders an app image input without a node editor provider", () => {
  const props: PropertyProps = {
    property: {
      name: "product",
      required: false,
      type: { type: "image", optional: false, type_args: [] }
    },
    value: null,
    nodeId: "",
    nodeType: "",
    propertyIndex: "0",
    onChange: jest.fn(),
    isConnected: false
  };
  render(<ImageProperty {...props} />);
  expect(screen.getByText("Upload product image")).toBeInTheDocument();
});
