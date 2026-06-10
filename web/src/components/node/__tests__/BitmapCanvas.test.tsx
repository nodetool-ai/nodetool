import React from "react";
import { render, screen } from "@testing-library/react";
import BitmapCanvas from "../BitmapCanvas";

describe("BitmapCanvas", () => {
  it("paints the bitmap onto a canvas sized to its dimensions", () => {
    const drawImage = jest.fn();
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);

    const bitmap = { width: 4, height: 2 } as unknown as ImageBitmap;
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
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);

    const first = { width: 2, height: 2 } as unknown as ImageBitmap;
    const second = { width: 8, height: 4 } as unknown as ImageBitmap;
    const { rerender } = render(<BitmapCanvas bitmap={first} />);
    rerender(<BitmapCanvas bitmap={second} />);

    expect(drawImage).toHaveBeenLastCalledWith(second, 0, 0);
    const canvas = screen.getByRole("img") as HTMLCanvasElement;
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(4);

    getContext.mockRestore();
  });
});
