/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

import { DirectGenLayerPanel } from "../DirectGenLayerPanel";
import type { Layer } from "../../types";

jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start: jest.fn(), cancel: jest.fn() }),
  directGenFailure: () => null,
  describeDirectGenFailure: () => ""
}));

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useMediaOptions: () => ({ data: undefined })
}));

jest.mock("../../../../hooks/sketch/useLayerCostEstimate", () => ({
  useLayerCostEstimate: () => null
}));

const layer = {
  id: "edit",
  name: "Image-to-Image",
  type: "raster",
  visible: true,
  opacity: 1,
  locked: false,
  alphaLock: false,
  blendMode: "normal",
  data: null,
  transform: { x: 0, y: 0 },
  contentBounds: { x: 0, y: 0, width: 1024, height: 1024 }
} as unknown as Layer;

describe("DirectGenLayerPanel", () => {
  // Round 6 F4: on a 900-pixel screen the layer's Generate button sat below
  // the inspector's fold, and the participant used the tool bar's Generate,
  // which opens a separate, empty text-to-image form.
  it("brings Generate into view when the prompt is focused", () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <ThemeProvider theme={mockTheme}>
        <DirectGenLayerPanel
          layer={layer}
          binding={{
            layerId: "edit",
            kind: "image-to-image",
            provider: "openai",
            model: "test-image-model",
            prompt: "",
            status: "draft",
            versions: []
          }}
        />
      </ThemeProvider>
    );
    act(() => {
      screen.getByPlaceholderText("Describe the image…").focus();
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.contexts[0]).toBe(
      screen.getByTestId("direct-gen-generate")
    );
  });
});
