import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import BitmapCanvas from "../BitmapCanvas";

describe("BitmapCanvas", () => {
  const mockGetContext = (drawImage: jest.Mock) =>
    // SAFETY: `getContext` is overloaded over every context id; this double
    // answers the "2d" id, the only one the code under test asks for.
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(((contextId: string) =>
        contextId === "2d"
          ? stub<CanvasRenderingContext2D>({ drawImage })
          : null) as HTMLCanvasElement["getContext"]);

  it("paints the bitmap onto a canvas sized to its dimensions", () => {
    const drawImage = jest.fn();
    const getContext = mockGetContext(drawImage);

    const bitmap = stub<ImageBitmap>({ width: 4, height: 2 });
    render(<BitmapCanvas bitmap={bitmap} aria-label="preview" />);

    const canvas = screen.getByRole("img", { name: "preview" });
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect((canvas as HTMLCanvasElement).width).toBe(4);
    expect((canvas as HTMLCanvasElement).height).toBe(2);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);

    getContext.mockRestore();
  });

  it("repaints when a new bitmap frame arrives", () => {
    const drawImage = jest.fn();
    const getContext = mockGetContext(drawImage);

    const first = stub<ImageBitmap>({ width: 2, height: 2 });
    const second = stub<ImageBitmap>({ width: 8, height: 4 });
    const { rerender } = render(<BitmapCanvas bitmap={first} />);
    rerender(<BitmapCanvas bitmap={second} />);

    expect(drawImage).toHaveBeenLastCalledWith(second, 0, 0);
    const canvas = screen.getByRole("img") as HTMLCanvasElement;
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(4);

    getContext.mockRestore();
  });
});
