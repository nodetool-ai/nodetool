export const defaultLayout = {
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
                    views: ["examples"],
                    activeView: "examples",
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
              size: 1010
            },
            {
              type: "leaf",
              data: {
                views: ["chat"],
                activeView: "chat",
                id: "1"
              },
              size: 195
            }
          ],
          size: 1417
        }
      ],
      size: 1205
    },
    width: 1417,
    height: 1205,
    orientation: "HORIZONTAL"
  },
  panels: {
    chat: {
      id: "chat",
      contentComponent: "chat",
      title: "Chat"
    },
    examples: {
      id: "examples",
      contentComponent: "examples",
      title: "Examples"
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
    }
  },
  activeGroup: "1"
};
