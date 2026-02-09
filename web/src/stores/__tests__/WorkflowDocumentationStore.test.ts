import { act } from "@testing-library/react";
import {
  useWorkflowDocumentationStore
} from "../WorkflowDocumentationStore";

describe("WorkflowDocumentationStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useWorkflowDocumentationStore.setState({
      documentation: {},
      isEditing: false,
      currentWorkflowId: null
    });
  });

  describe("initial state", () => {
    it("has empty documentation initially", () => {
      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(documentation).toEqual({});
    });

    it("is not editing initially", () => {
      const { isEditing } = useWorkflowDocumentationStore.getState();
      expect(isEditing).toBe(false);
    });

    it("has no current workflow ID initially", () => {
      const { currentWorkflowId } =
        useWorkflowDocumentationStore.getState();
      expect(currentWorkflowId).toBeNull();
    });
  });

  describe("setDocumentation", () => {
    it("adds documentation for a workflow", () => {
      const { setDocumentation } = useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Test Documentation");
      });

      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(documentation["workflow-1"]).toEqual({
        workflowId: "workflow-1",
        content: "# Test Documentation",
        lastModified: expect.any(Number)
      });
    });

    it("updates existing documentation", () => {
      const { setDocumentation } = useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Original");
        setDocumentation("workflow-1", "# Updated");
      });

      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(documentation["workflow-1"].content).toBe("# Updated");
    });

    it("sets lastModified timestamp", () => {
      const { setDocumentation } = useWorkflowDocumentationStore.getState();
      const beforeTime = Date.now();

      act(() => {
        setDocumentation("workflow-1", "# Test");
      });

      const afterTime = Date.now();
      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(documentation["workflow-1"].lastModified).toBeGreaterThanOrEqual(
        beforeTime
      );
      expect(documentation["workflow-1"].lastModified).toBeLessThanOrEqual(
        afterTime
      );
    });

    it("handles multiple workflows", () => {
      const { setDocumentation } = useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Doc 1");
        setDocumentation("workflow-2", "# Doc 2");
        setDocumentation("workflow-3", "# Doc 3");
      });

      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(Object.keys(documentation)).toHaveLength(3);
      expect(documentation["workflow-1"].content).toBe("# Doc 1");
      expect(documentation["workflow-2"].content).toBe("# Doc 2");
      expect(documentation["workflow-3"].content).toBe("# Doc 3");
    });
  });

  describe("getDocumentation", () => {
    it("returns null for non-existent workflow", () => {
      const { getDocumentation } = useWorkflowDocumentationStore.getState();
      expect(getDocumentation("non-existent")).toBeNull();
    });

    it("returns content for existing workflow", () => {
      const { setDocumentation, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Test Content");
      });

      expect(getDocumentation("workflow-1")).toBe("# Test Content");
    });

    it("returns independent copies for different workflows", () => {
      const { setDocumentation, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Content 1");
        setDocumentation("workflow-2", "# Content 2");
      });

      expect(getDocumentation("workflow-1")).toBe("# Content 1");
      expect(getDocumentation("workflow-2")).toBe("# Content 2");
    });
  });

  describe("deleteDocumentation", () => {
    it("removes documentation for a workflow", () => {
      const { setDocumentation, deleteDocumentation, documentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Test");
        deleteDocumentation("workflow-1");
      });

      expect(documentation["workflow-1"]).toBeUndefined();
    });

    it("does nothing for non-existent workflow", () => {
      const { deleteDocumentation, documentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        deleteDocumentation("non-existent");
      });

      expect(documentation).toEqual({});
    });

    it("only deletes specified workflow", () => {
      const { setDocumentation, deleteDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Doc 1");
        setDocumentation("workflow-2", "# Doc 2");
        deleteDocumentation("workflow-1");
      });

      const { documentation } = useWorkflowDocumentationStore.getState();
      expect(documentation["workflow-1"]).toBeUndefined();
      expect(documentation["workflow-2"]).toBeDefined();
    });
  });

  describe("setIsEditing", () => {
    it("sets editing state to true", () => {
      const { setIsEditing } = useWorkflowDocumentationStore.getState();

      act(() => {
        setIsEditing(true);
      });

      const { isEditing } = useWorkflowDocumentationStore.getState();
      expect(isEditing).toBe(true);
    });

    it("sets editing state to false", () => {
      const { setIsEditing } = useWorkflowDocumentationStore.getState();

      act(() => {
        setIsEditing(true);
        setIsEditing(false);
      });

      const { isEditing } = useWorkflowDocumentationStore.getState();
      expect(isEditing).toBe(false);
    });
  });

  describe("setCurrentWorkflowId", () => {
    it("sets current workflow ID", () => {
      const { setCurrentWorkflowId } = useWorkflowDocumentationStore.getState();

      act(() => {
        setCurrentWorkflowId("workflow-1");
      });

      const { currentWorkflowId } =
        useWorkflowDocumentationStore.getState();
      expect(currentWorkflowId).toBe("workflow-1");
    });

    it("sets current workflow ID to null", () => {
      const { setCurrentWorkflowId } = useWorkflowDocumentationStore.getState();

      act(() => {
        setCurrentWorkflowId("workflow-1");
        setCurrentWorkflowId(null);
      });

      const { currentWorkflowId } =
        useWorkflowDocumentationStore.getState();
      expect(currentWorkflowId).toBeNull();
    });
  });

  describe("clearAll", () => {
    it("clears all documentation", () => {
      const { setDocumentation, clearAll, documentation, setIsEditing, setCurrentWorkflowId } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Doc 1");
        setDocumentation("workflow-2", "# Doc 2");
        setIsEditing(true);
        setCurrentWorkflowId("workflow-1");
        clearAll();
      });

      expect(documentation).toEqual({});
      expect(useWorkflowDocumentationStore.getState().isEditing).toBe(false);
      expect(
        useWorkflowDocumentationStore.getState().currentWorkflowId
      ).toBeNull();
    });
  });

  describe("complex scenarios", () => {
    it("handles rapid updates to the same workflow", () => {
      const { setDocumentation, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "Version 1");
        setDocumentation("workflow-1", "Version 2");
        setDocumentation("workflow-1", "Version 3");
      });

      expect(getDocumentation("workflow-1")).toBe("Version 3");
    });

    it("maintains separate documentation when switching workflows", () => {
      const { setDocumentation, setCurrentWorkflowId, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "# Workflow 1 Doc");
        setCurrentWorkflowId("workflow-1");
        setDocumentation("workflow-2", "# Workflow 2 Doc");
        setCurrentWorkflowId("workflow-2");
      });

      expect(getDocumentation("workflow-1")).toBe("# Workflow 1 Doc");
      expect(getDocumentation("workflow-2")).toBe("# Workflow 2 Doc");
      expect(
        useWorkflowDocumentationStore.getState().currentWorkflowId
      ).toBe("workflow-2");
    });

    it("handles empty content strings", () => {
      const { setDocumentation, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      act(() => {
        setDocumentation("workflow-1", "");
      });

      expect(getDocumentation("workflow-1")).toBe("");
    });

    it("handles markdown content with special characters", () => {
      const { setDocumentation, getDocumentation } =
        useWorkflowDocumentationStore.getState();

      const markdownContent = `
# Heading with **bold** and *italic*

\`\`\`javascript
const code = "here";
\`\`\`

- List item 1
- List item 2

[Link](https://example.com)
      `.trim();

      act(() => {
        setDocumentation("workflow-1", markdownContent);
      });

      expect(getDocumentation("workflow-1")).toBe(markdownContent);
    });
  });
});
