import { SerializedDockview, Orientation } from "dockview";

export const defaultLayout: SerializedDockview = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "branch",
          data: [
            {
              type: "branch",
              data: [
                {
                  type: "leaf",
                  data: {
                    views: ["workflows"],
                    activeView: "workflows",
                    id: "3"
                  },
                  size: 708
                },
                {
                  type: "leaf",
                  data: {
                    views: ["recent-chats"],
                    activeView: "recent-chats",
                    id: "4"
                  },
                  size: 709
                }
              ],
              size: 1085
            }
          ],
          size: 1417
        }
      ],
      size: 1205
    },
    width: 1417,
    height: 1205,
    orientation: Orientation.HORIZONTAL
  },
  panels: {
    workflows: {
      id: "workflows",
      contentComponent: "workflows",
      title: "Recent Workflows"
    },
    "recent-chats": {
      id: "recent-chats",
      contentComponent: "recent-chats",
      title: "Recent Chats"
    }
  },
  activeGroup: "3"
};
