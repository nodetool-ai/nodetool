import { findVideoTrackTarget } from "../realtimeTargetDiscovery";
import type { Workflow } from "../../../stores/ApiTypes";

describe("findVideoTrackTarget", () => {
  it("targets VideoSource frames through the camera input and realtime_frame source handle", () => {
    const workflow = {
      graph: {
        nodes: [
          {
            id: "7f767413-9abc-4012-b501-ac341e9104ea",
            type: "nodetool.video.VideoSource",
            name: "7f767413-9abc-4012-b501-ac341e9104ea",
            properties: {
              source: "camera",
              realtime_frame: null
            },
            outputs: {
              image: "image",
              realtime_frame: "realtime_video_frame"
            }
          }
        ],
        edges: []
      }
    } as unknown as Workflow;

    expect(findVideoTrackTarget(workflow)).toEqual({
      nodeId: "7f767413-9abc-4012-b501-ac341e9104ea",
      inputName: "camera",
      sourceHandle: "realtime_frame"
    });
  });
});
