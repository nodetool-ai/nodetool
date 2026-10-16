import { contrastingInk } from "../ensureSketchDocumentForAsset";
import { useSketchStore } from "../../../components/sketch/state/useSketchStore";
import { createDefaultDocument } from "../../../components/sketch/types";

jest.mock("../../../trpc/client", () => ({ trpcClient: {} }));

/** A canvas whose single averaged pixel is `rgba`. */
function stubCanvasPixel(rgba: [number, number, number, number]): void {
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: jest.fn(),
    getImageData: () => ({ data: Uint8ClampedArray.from(rgba) })
  } as never);
}

const image = {} as CanvasImageSource;

afterEach(() => {
  jest.restoreAllMocks();
});

describe("contrastingInk", () => {
  it("draws black on a white image", () => {
    stubCanvasPixel([255, 255, 255, 255]);
    expect(contrastingInk(image)).toBe("#000000");
  });

  it("draws white on a dark image", () => {
    stubCanvasPixel([20, 30, 40, 255]);
    expect(contrastingInk(image)).toBe("#ffffff");
  });

  it("keeps the default ink when the pixels cannot be read", () => {
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        throw new Error("tainted");
      });
    expect(contrastingInk(image)).toBeUndefined();
  });
});

describe("opening a sketch", () => {
  it("shows the brush's ink in the color swatch", () => {
    const doc = createDefaultDocument(8, 8);
    doc.toolSettings.brush.color = "#000000";
    useSketchStore.getState().setDocument(doc);
    expect(useSketchStore.getState().foregroundColor).toBe("#000000");
  });
});
