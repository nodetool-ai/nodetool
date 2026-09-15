import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  AIEditControl,
  emitTimelineGenerativeEdit
} from "../AIEditControl";

describe("AIEditControl", () => {
  it("offers the provider-agnostic edit operations and submits the selected intent", () => {
    const onSubmit = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <AIEditControl onSubmit={onSubmit} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /AI Edit/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Restyle" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Restyle/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      "restyle",
      "Restyle this clip with the requested visual direction"
    );
  });

  it("emits an intent without changing the active take", () => {
    const clip = makeClip({
      id: "clip-1",
      trackId: "track-1",
      mediaType: "video",
      sourceType: "generated",
      status: "generated",
      currentAssetId: "asset-1",
      activeTakeId: "take-1"
    });
    const listener = jest.fn();
    window.addEventListener("nodetool:timeline-generative-edit", listener);

    emitTimelineGenerativeEdit(clip, "extend", "Extend by one second");

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      clipId: "clip-1",
      sourceAssetId: "asset-1",
      operation: "extend",
      direction: "end",
      durationMs: 1000
    });
    expect(clip.activeTakeId).toBe("take-1");
    window.removeEventListener("nodetool:timeline-generative-edit", listener);
  });
});
