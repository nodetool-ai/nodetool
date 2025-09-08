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
                    views: ["templates"],
                    activeView: "templates",
                    id: "2"
                  },
                  size: 472
                },
                {
                  type: "leaf",
                  data: {
                    views: ["workflows"],
                    activeView: "workflows",
                    id: "3"
                  },
                  size: 472
                },
                {
                  type: "leaf",
                  data: {
                    views: ["recent-chats"],
                    activeView: "recent-chats",
                    id: "4"
                  },
                  size: 473
                }
              ],
              size: 1085
            },
            {
              type: "leaf",
              data: {
                views: ["chat"],
                activeView: "chat",
                id: "1"
              },
              size: 120
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
    templates: {
      id: "templates",
      contentComponent: "templates",
      title: "Templates"
    },
    workflows: {
      id: "workflows",
      contentComponent: "workflows",
      title: "Recent Workflows"
    },
    "recent-chats": {
      id: "recent-chats",
      contentComponent: "recent-chats",
      title: "Recent Chats"
    },
    chat: {
      id: "chat",
      contentComponent: "chat",
      title: "Chat"
    }
  },
  activeGroup: "1"
};
