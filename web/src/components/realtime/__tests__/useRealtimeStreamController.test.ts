import {
  findVideoTrackTarget,
  findVideoTrackCameraSettings
} from "../realtimeTargetDiscovery";
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

  it("reads persisted VideoSource camera settings from the target node", () => {
    const workflow = {
      graph: {
        nodes: [
          {
            id: "camera-node",
            type: "nodetool.video.VideoSource",
            name: "camera-node",
            properties: {
              source: "camera",
              camera_device_id: "usb-camera-1",
              camera_device_label: "USB Camera",
              camera_resolution: "wide480p"
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

    expect(findVideoTrackCameraSettings(workflow)).toEqual({
      nodeId: "camera-node",
      deviceId: "usb-camera-1",
      deviceLabel: "USB Camera",
      resolution: "wide480p"
    });
  });
});
