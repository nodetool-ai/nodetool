import React from "react";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { act, render } from "@testing-library/react";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { TransformWithWorkflowViewProps } from "../../../assets/TransformWithWorkflowDialog";
import { TransformClipDialog, canTransformClip } from "../TransformClipDialog";

const mockView = jest.fn<(props: TransformWithWorkflowViewProps) => null>(() => null);
jest.mock("../../../assets/TransformWithWorkflowDialog", () => ({
  TransformWithWorkflowView: (props: TransformWithWorkflowViewProps) => mockView(props)
}));

const clip = (
  id: string,
  mediaType: TimelineClip["mediaType"],
  currentAssetId?: string
): TimelineClip =>
  ({
    id,
    trackId: "t1",
    name: `Clip ${id}`,
    startMs: 0,
    durationMs: 1000,
    mediaType,
    sourceType: "imported",
    currentAssetId
  }) as TimelineClip;

describe("TransformClipDialog", () => {
  const replaceClipOutput = jest.fn();

  beforeEach(() => {
    mockView.mockClear();
    replaceClipOutput.mockClear();
    useTimelineStore.setState({
      clips: [clip("v", "video", "asset-v"), clip("t", "text")],
      replaceClipOutput
    } as never);
  });

  afterEach(() => {
    act(() => {
      useTimelineStore.setState({ clips: [] });
    });
  });

  it("runs the clip's current media and replaces it with an output of its kind", () => {
    render(<TransformClipDialog clipId="v" onClose={jest.fn()} />);

    const props = mockView.mock.calls[0][0];
    expect(props.source).toEqual({
      kind: "video",
      name: "Clip v",
      uri: "asset://asset-v",
      assetId: "asset-v"
    });
    expect(props.apply?.kinds).toEqual(["video"]);

    void props.apply?.onApply({
      assetId: "out-1",
      kind: "video",
      name: "out.mp4",
      uri: "asset://out-1"
    });
    expect(replaceClipOutput).toHaveBeenCalledWith("v", "out-1");
  });

  it("knows which clips carry media a workflow can take", () => {
    expect(canTransformClip(clip("a", "audio", "asset-a"))).toBe(true);
    expect(canTransformClip(clip("a", "audio"))).toBe(false);
    expect(canTransformClip(clip("t", "text", "asset-t"))).toBe(false);
  });
});
