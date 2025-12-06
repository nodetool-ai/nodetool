import { SerializedDockview, Orientation } from "dockview";

export const defaultLayout: SerializedDockview = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "leaf",
          data: {
            views: ["welcome"],
            activeView: "welcome",
            id: "welcome"
          },
          size: 300
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
      size: 1200
    },
    width: 1200,
    height: 800,
    orientation: Orientation.HORIZONTAL
  },
  panels: {
    welcome: {
      id: "welcome",
      contentComponent: "welcome",
      title: "Welcome"
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
