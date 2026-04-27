import { render, screen } from "@testing-library/react";
import { RealtimeVideoFrameRenderer } from "../RealtimeVideoFrameRenderer";
import { typeFor } from "../types";

describe("RealtimeVideoFrameRenderer", () => {
  const putImageData = jest.fn();

  beforeEach(() => {
    putImageData.mockClear();
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ putImageData } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("draws rgba8 realtime video frames", () => {
    const frame = {
      type: "realtime_video_frame" as const,
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      stride: 4,
      pixel_format: "rgba8",
      timestamp_ns: 123,
      sequence: 7
    };

    expect(typeFor(frame)).toBe("realtime_video_frame");
    render(
      <RealtimeVideoFrameRenderer frame={frame} />
    );

    expect(screen.getByLabelText("Realtime video frame")).toBeInTheDocument();
    expect(putImageData).toHaveBeenCalledTimes(1);
    const imageData = putImageData.mock.calls[0][0] as ImageData;
    expect(Array.from(imageData.data)).toEqual([255, 0, 0, 255]);
  });

  it("expands rgb8 realtime video frames to canvas rgba pixels", () => {
    render(
      <RealtimeVideoFrameRenderer
        frame={{
          type: "realtime_video_frame",
          data: [0, 255, 0],
          width: 1,
          height: 1,
          stride: 3,
          pixel_format: "rgb8",
          timestamp_ns: 456,
          sequence: 8
        }}
      />
    );

    const imageData = putImageData.mock.calls[0][0] as ImageData;
    expect(Array.from(imageData.data)).toEqual([0, 255, 0, 255]);
  });

  it("shows metadata for unsupported realtime video frame formats", () => {
    render(
      <RealtimeVideoFrameRenderer
        frame={{
          type: "realtime_video_frame",
          data: new Uint8Array([0]),
          width: 2,
          height: 2,
          stride: 2,
          pixel_format: "nv12",
          timestamp_ns: 789,
          sequence: 9
        }}
      />
    );

    expect(
      screen.getByText("Unsupported realtime video format: nv12")
    ).toBeInTheDocument();
    expect(screen.getByText("2x2")).toBeInTheDocument();
    expect(screen.getByText("seq 9")).toBeInTheDocument();
    expect(putImageData).not.toHaveBeenCalled();
  });
});
