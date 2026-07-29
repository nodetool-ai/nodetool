import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Data, Frame } from "plotly.js";

// Mock plotly.js so the effect wrapper can be exercised without the real
// (heavy, canvas-bound) library. Each method resolves like the async Plotly API.
const react = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));
const addFrames = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));
const deleteFrames = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined)
);
const purge = jest.fn((..._args: unknown[]) => undefined);
const resize = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));

jest.mock("plotly.js", () => ({
  react: (...args: unknown[]) => react(...args),
  addFrames: (...args: unknown[]) => addFrames(...args),
  deleteFrames: (...args: unknown[]) => deleteFrames(...args),
  purge: (...args: unknown[]) => purge(...args),
  Plots: { resize: (...args: unknown[]) => resize(...args) }
}));

import PlotlyChart from "../PlotlyChart";

const DATA: Data[] = [{ x: [1, 2, 3], y: [1, 2, 3], type: "scatter" }];
const frame = (name: string): Frame => ({ name }) as Frame;

beforeEach(() => {
  react.mockClear();
  addFrames.mockClear();
  deleteFrames.mockClear();
  purge.mockClear();
  resize.mockClear();
});

afterEach(cleanup);

describe("PlotlyChart", () => {
  it("renders the initial frames without deleting anything", async () => {
    render(<PlotlyChart data={DATA} frames={[frame("a"), frame("b")]} />);

    await waitFor(() => expect(addFrames).toHaveBeenCalledTimes(1));
    expect(react).toHaveBeenCalledTimes(1);
    expect(addFrames.mock.calls[0][1]).toHaveLength(2);
    // Nothing was registered yet, so no delete on first mount.
    expect(deleteFrames).not.toHaveBeenCalled();
  });

  it("replaces frames instead of accumulating them when they change", async () => {
    const { rerender } = render(
      <PlotlyChart data={DATA} frames={[frame("a"), frame("b")]} />
    );
    await waitFor(() => expect(addFrames).toHaveBeenCalledTimes(1));

    rerender(<PlotlyChart data={DATA} frames={[frame("c")]} />);

    await waitFor(() => expect(addFrames).toHaveBeenCalledTimes(2));
    // The two previously-registered frames are dropped before adding the new one.
    expect(deleteFrames).toHaveBeenCalledTimes(1);
    expect(deleteFrames.mock.calls[0][1]).toEqual([0, 1]);
    expect(addFrames.mock.calls[1][1]).toHaveLength(1);
  });

  it("clears previously registered frames when frames are removed", async () => {
    const { rerender } = render(
      <PlotlyChart data={DATA} frames={[frame("a"), frame("b")]} />
    );
    await waitFor(() => expect(addFrames).toHaveBeenCalledTimes(1));

    rerender(<PlotlyChart data={DATA} frames={[]} />);

    await waitFor(() => expect(deleteFrames).toHaveBeenCalledTimes(1));
    expect(deleteFrames.mock.calls[0][1]).toEqual([0, 1]);
    // No new frames added — the empty list only clears.
    expect(addFrames).toHaveBeenCalledTimes(1);
  });

  it("purges Plotly on unmount", async () => {
    const { unmount } = render(<PlotlyChart data={DATA} />);
    await waitFor(() => expect(react).toHaveBeenCalled());

    unmount();

    expect(purge).toHaveBeenCalledTimes(1);
  });
});
