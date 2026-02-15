/**
 * Tests for resource change handler
 */
import { handleResourceChange } from "../resourceChangeHandler";
import { queryClient } from "../../queryClient";
import { ResourceChangeUpdate } from "../ApiTypes";

// Mock the queryClient
jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn()
  }
}));

describe("handleResourceChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("invalidates workflow queries on workflow update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "workflow-123",
        etag: "abc123"
      }
    };

    handleResourceChange(update);

    // Should invalidate general workflows query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workflows"]
    });

    // Should also invalidate templates query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["templates"]
    });

    // Should invalidate specific workflow query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workflow", "workflow-123"]
    });

    // Should invalidate workflow versions query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workflow", "workflow-123", "versions"]
    });
  });

  it("invalidates job queries on job created", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "job",
      resource: {
        id: "job-456",
        etag: "def456"
      }
    };

    handleResourceChange(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["jobs"]
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["job", "job-456"]
    });
  });

  it("invalidates asset queries on asset deleted", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "deleted",
      resource_type: "asset",
      resource: {
        id: "asset-789"
      }
    };

    handleResourceChange(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets"]
    });
  });

  it("invalidates thread and messages queries on thread update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "thread",
      resource: {
        id: "thread-101",
        etag: "ghi101"
      }
    };

    handleResourceChange(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["threads"]
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["thread", "thread-101"]
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["messages", "thread-101"]
    });
  });

  it("handles resource types without query key mappings", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "unknown_resource",
      resource: {
        id: "unknown-999"
      }
    };

    // Should not throw
    handleResourceChange(update);

    // Should not invalidate any queries
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("handles resource without id gracefully", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "", // Empty id
        etag: "abc"
      }
    };

    // Should not throw
    handleResourceChange(update);

    // Should still invalidate general queries
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workflows"]
    });
  });

  it("includes additional resource properties in the update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "workflow-123",
        etag: "abc123",
        name: "My Workflow",
        status: "active"
      }
    };

    // Should not throw with additional properties
    handleResourceChange(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });
});
