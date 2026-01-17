/**
 * Default Dockview layout for the Timeline Editor
 *
 * Layout structure:
 * ┌─────────┬───────────────────────────┬───────────┐
 * │ Tracks  │           Timeline        │ Inspector │
 * │         │                           │           │
 * │ (200px) │                           │  (250px)  │
 * ├─────────┼─────────────────┬─────────┴───────────┤
 * │         │  Media Assets   │       Preview       │
 * │         │                 │                     │
 * └─────────┴─────────────────┴─────────────────────┘
 */
import { SerializedDockview, Orientation } from "dockview";

export const timelineDefaultLayout: SerializedDockview = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "branch",
          data: [
            {
              type: "leaf",
              data: {
                views: ["tracks"],
                activeView: "tracks",
                id: "tracks"
              },
              size: 200
            },
            {
              type: "leaf",
              data: {
                views: ["timeline"],
                activeView: "timeline",
                id: "timeline"
              },
              size: 550
            },
            {
              type: "leaf",
              data: {
                views: ["inspector"],
                activeView: "inspector",
                id: "inspector"
              },
              size: 250
            }
          ],
          size: 500
        },
        {
          type: "branch",
          data: [
            {
              type: "leaf",
              data: {
                views: ["media-assets"],
                activeView: "media-assets",
                id: "media-assets"
              },
              size: 300
            },
            {
              type: "leaf",
              data: {
                views: ["preview"],
                activeView: "preview",
                id: "preview"
              },
              size: 400
            }
          ],
          size: 280
        }
      ],
      size: 780
    },
    width: 1200,
    height: 780,
    orientation: Orientation.VERTICAL
  },
  panels: {
    tracks: {
      id: "tracks",
      contentComponent: "tracks",
      title: "Tracks"
    },
    timeline: {
      id: "timeline",
      contentComponent: "timeline",
      title: "Timeline"
    },
    "media-assets": {
      id: "media-assets",
      contentComponent: "media-assets",
      title: "Media Assets"
    },
    preview: {
      id: "preview",
      contentComponent: "preview",
      title: "Preview"
    },
    inspector: {
      id: "inspector",
      contentComponent: "inspector",
      title: "Inspector"
    }
  },
  activeGroup: "timeline"
};

