import { SerializedDockview, Orientation } from "dockview";

export const defaultLayout: SerializedDockview = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "leaf",
          data: {
            views: ["getting-started"],
            activeView: "getting-started",
            id: "getting-started"
          },
          size: 320
        },
        {
          type: "leaf",
          data: {
            views: ["templates"],
            activeView: "templates",
            id: "templates"
          },
          size: 500
        },
        {
          type: "leaf",
          data: {
            views: ["activity"],
            activeView: "activity",
            id: "activity"
          },
          size: 400
        }
      ],
      size: 1220
    },
    width: 1220,
    height: 800,
    orientation: Orientation.HORIZONTAL
  },
  panels: {
    "getting-started": {
      id: "getting-started",
      contentComponent: "getting-started",
      title: "Getting Started"
    },
    templates: {
      id: "templates",
      contentComponent: "templates",
      title: "Templates"
    },
    activity: {
      id: "activity",
      contentComponent: "activity",
      title: "Activity"
    }
  },
  activeGroup: "templates"
};
