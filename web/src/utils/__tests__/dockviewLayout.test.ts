/**
 * @jest-environment node
 */
import { migrateDockviewLayout, applyDockviewLayoutSafely } from "../dockviewLayout";
import { DockviewApi, SerializedDockview } from "dockview";

// Mock the defaultLayout
jest.mock("../../config/defaultLayouts", () => ({
  defaultLayout: {
    panels: {
      templates: { id: "templates", contentComponent: "templates", title: "templates" },
      workflows: { id: "workflows", contentComponent: "workflows", title: "workflows" },
      "recent-chats": { id: "recent-chats", contentComponent: "recent-chats", title: "recent-chats" },
      chat: { id: "chat", contentComponent: "chat", title: "chat" }
    },
    grid: {
      root: {
        type: "leaf",
        data: {
          views: ["templates"],
          activeView: "templates",
          id: "default"
        }
      }
    }
  }
}));

describe("dockviewLayout", () => {
  describe("migrateDockviewLayout", () => {
    it("should migrate legacy 'examples' panel to 'templates'", () => {
      const legacyLayout: SerializedDockview = {
        panels: {
          examples: {
            id: "examples",
            contentComponent: "examples",
            title: "Examples"
          },
          workflows: {
            id: "workflows",
            contentComponent: "workflows",
            title: "Workflows"
          }
        } as any,
        grid: {
          root: {
            type: "leaf",
            data: {
              views: ["examples", "workflows"],
              activeView: "examples",
              id: "main"
            }
          } as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(legacyLayout);

      // Check that 'examples' panel is renamed to 'templates'
      expect((migrated.panels as any).examples).toBeUndefined();
      expect((migrated.panels as any).templates).toBeDefined();
      expect((migrated.panels as any).templates.id).toBe("templates");
      expect((migrated.panels as any).templates.contentComponent).toBe("templates");
      
      // Check that views are updated
      const root = (migrated.grid as any).root;
      expect(root.data.views).toContain("templates");
      expect(root.data.views).not.toContain("examples");
      expect(root.data.activeView).toBe("templates");
    });

    it("should ensure all required panels exist", () => {
      const minimalLayout: SerializedDockview = {
        panels: {} as any,
        grid: {} as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(minimalLayout);

      // Check that all required panels are created
      expect((migrated.panels as any).templates).toBeDefined();
      expect((migrated.panels as any).workflows).toBeDefined();
      expect((migrated.panels as any)["recent-chats"]).toBeDefined();
      expect((migrated.panels as any).chat).toBeDefined();
    });

    it("should handle missing panels property", () => {
      const layoutNoPanels: SerializedDockview = {
        grid: {} as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutNoPanels);

      expect(migrated.panels).toBeDefined();
      expect((migrated.panels as any).templates).toBeDefined();
    });

    it("should filter out invalid views from leaf nodes", () => {
      const layoutWithInvalidViews: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {
          root: {
            type: "leaf",
            data: {
              views: ["invalid", "nonexistent", "templates"],
              activeView: "invalid",
              id: "main"
            }
          } as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutWithInvalidViews);
      const root = (migrated.grid as any).root;

      // Should only keep valid views
      expect(root.data.views).toEqual(["templates"]);
      // Should fix activeView to a valid one
      expect(root.data.activeView).toBe("templates");
    });

    it("should ensure at least one valid view in leaf nodes", () => {
      const layoutNoValidViews: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {
          root: {
            type: "leaf",
            data: {
              views: ["invalid", "nonexistent"],
              activeView: "invalid",
              id: "main"
            }
          } as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutNoValidViews);
      const root = (migrated.grid as any).root;

      // Should add "templates" as fallback
      expect(root.data.views).toContain("templates");
      expect(root.data.activeView).toBe("templates");
    });

    it("should handle branch nodes recursively", () => {
      const layoutWithBranch: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" },
          workflows: { id: "workflows", contentComponent: "workflows", title: "workflows" },
          chat: { id: "chat", contentComponent: "chat", title: "chat" }
        } as any,
        grid: {
          root: {
            type: "branch",
            data: [
              {
                type: "leaf",
                data: {
                  views: ["examples"], // legacy id
                  activeView: "examples",
                  id: "left"
                }
              },
              {
                type: "branch",
                data: [
                  {
                    type: "leaf",
                    data: {
                      views: ["workflows"],
                      activeView: "workflows",
                      id: "top-right"
                    }
                  },
                  {
                    type: "leaf",
                    data: {
                      views: ["chat", "invalid"],
                      activeView: "chat",
                      id: "bottom-right"
                    }
                  }
                ]
              }
            ]
          } as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutWithBranch);
      const root = (migrated.grid as any).root;

      // Check first leaf (should have "examples" -> "templates")
      expect(root.data[0].data.views).toContain("templates");
      expect(root.data[0].data.activeView).toBe("templates");

      // Check nested branch
      const nestedBranch = root.data[1];
      expect(nestedBranch.type).toBe("branch");
      
      // Check nested leaves
      expect(nestedBranch.data[0].data.views).toContain("workflows");
      expect(nestedBranch.data[1].data.views).toContain("chat");
      expect(nestedBranch.data[1].data.views).not.toContain("invalid");
    });

    it("should preserve node sizes", () => {
      const layoutWithSizes: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {
          root: {
            type: "branch",
            size: 100,
            data: [
              {
                type: "leaf",
                size: 50,
                data: {
                  views: ["templates"],
                  activeView: "templates",
                  id: "main"
                }
              },
              {
                type: "leaf",
                size: 50,
                data: {
                  views: ["templates"],
                  activeView: "templates",
                  id: "side"
                }
              }
            ]
          } as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutWithSizes);
      const root = (migrated.grid as any).root;

      expect(root.size).toBe(100);
      expect(root.data[0].size).toBe(50);
      expect(root.data[1].size).toBe(50);
    });

    it("should not modify the original layout object", () => {
      const originalLayout: SerializedDockview = {
        panels: {
          examples: { id: "examples", contentComponent: "examples", title: "Examples" }
        } as any,
        grid: {
          root: {
            type: "leaf",
            data: {
              views: ["examples"],
              activeView: "examples",
              id: "main"
            }
          } as any
        } as any
      } as SerializedDockview;

      const originalCopy = JSON.parse(JSON.stringify(originalLayout));
      migrateDockviewLayout(originalLayout);

      expect(originalLayout).toEqual(originalCopy);
    });

    it("should handle empty grid", () => {
      const layoutNoGrid: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {} as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutNoGrid);
      expect(migrated.grid).toBeDefined();
    });

    it("should handle null root in grid", () => {
      const layoutNullRoot: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {
          root: null as any
        } as any
      } as SerializedDockview;

      const migrated = migrateDockviewLayout(layoutNullRoot);
      expect(migrated.grid.root).toBeNull();
    });
  });

  describe("applyDockviewLayoutSafely", () => {
    let mockApi: DockviewApi;

    beforeEach(() => {
      mockApi = {
        fromJSON: jest.fn()
      } as any;
    });

    it("should apply migrated layout to API", () => {
      const layout: SerializedDockview = {
        panels: {
          templates: { id: "templates", contentComponent: "templates", title: "templates" }
        } as any,
        grid: {
          root: {
            type: "leaf",
            data: {
              views: ["templates"],
              activeView: "templates",
              id: "main"
            }
          } as any
        } as any
      } as SerializedDockview;

      applyDockviewLayoutSafely(mockApi, layout);

      expect(mockApi.fromJSON).toHaveBeenCalledTimes(1);
      const calledWith = (mockApi.fromJSON as jest.Mock).mock.calls[0][0];
      expect((calledWith.panels as any).templates).toBeDefined();
    });

    it("should fallback to default layout on migration error", () => {
      const invalidLayout = null as any;

      applyDockviewLayoutSafely(mockApi, invalidLayout);

      expect(mockApi.fromJSON).toHaveBeenCalledTimes(1);
      const calledWith = (mockApi.fromJSON as jest.Mock).mock.calls[0][0];
      // Should have called with defaultLayout
      expect((calledWith.panels as any).templates).toBeDefined();
      expect((calledWith.panels as any).workflows).toBeDefined();
    });

    it("should fallback to default layout if fromJSON throws", () => {
      const layout: SerializedDockview = {
        panels: {} as any,
        grid: {} as any
      } as SerializedDockview;

      // Make fromJSON throw on first call, succeed on second
      (mockApi.fromJSON as jest.Mock)
        .mockImplementationOnce(() => { throw new Error("Invalid layout"); })
        .mockImplementationOnce(() => {});

      applyDockviewLayoutSafely(mockApi, layout);

      expect(mockApi.fromJSON).toHaveBeenCalledTimes(2);
      // Second call should be with defaultLayout
      const secondCall = (mockApi.fromJSON as jest.Mock).mock.calls[1][0];
      expect((secondCall.panels as any).templates).toBeDefined();
    });

    it("should handle errors in both migration and default layout", () => {
      const layout: SerializedDockview = {
        panels: {} as any,
        grid: {} as any
      } as SerializedDockview;

      // Make fromJSON always throw
      (mockApi.fromJSON as jest.Mock).mockImplementation(() => {
        throw new Error("API error");
      });

      // Should not throw even if both attempts fail
      expect(() => applyDockviewLayoutSafely(mockApi, layout)).not.toThrow();
      expect(mockApi.fromJSON).toHaveBeenCalledTimes(2);
    });
  });
});