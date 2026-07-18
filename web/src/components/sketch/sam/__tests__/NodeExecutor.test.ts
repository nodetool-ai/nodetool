/**
 * @jest-environment node
 */
import {
  WebSocketNodeExecutor,
  getNodeExecutor,
  setNodeExecutor,
  type NodeExecutor,
  type NodeExecutionResult
} from "../NodeExecutor";

jest.mock("../../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn()
}));

import { runInlineGraphJob } from "../../../../lib/workflow/runInlineGraphJob";

const mockRunInlineGraphJob = runInlineGraphJob as jest.MockedFunction<
  typeof runInlineGraphJob
>;

describe("NodeExecutor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setNodeExecutor(null as unknown as NodeExecutor);
  });

  describe("getNodeExecutor", () => {
    it("returns a WebSocketNodeExecutor by default", () => {
      const executor = getNodeExecutor();
      expect(executor).toBeInstanceOf(WebSocketNodeExecutor);
    });

    it("returns the same instance on repeated calls", () => {
      const first = getNodeExecutor();
      const second = getNodeExecutor();
      expect(first).toBe(second);
    });
  });

  describe("setNodeExecutor", () => {
    it("overrides the default executor", () => {
      const custom: NodeExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          outputs: {},
        })
      };
      setNodeExecutor(custom);
      expect(getNodeExecutor()).toBe(custom);
    });
  });

  describe("WebSocketNodeExecutor.execute", () => {
    it("delegates to runInlineGraphJob and returns the result", async () => {
      mockRunInlineGraphJob.mockResolvedValue({
        success: true,
        outputs: { mask: "data:image/png;base64,..." },
        error: undefined
      });

      const executor = new WebSocketNodeExecutor();
      const graph = { nodes: [], edges: [] };
      const result = await executor.execute(graph);

      expect(mockRunInlineGraphJob).toHaveBeenCalledWith(
        expect.objectContaining({
          graph,
          params: undefined,
          signal: undefined,
          workflowId: expect.stringContaining("sketch-segmentation-")
        })
      );
      expect(result).toEqual({
        success: true,
        outputs: { mask: "data:image/png;base64,..." },
        error: undefined
      });
    });

    it("passes params and signal through", async () => {
      mockRunInlineGraphJob.mockResolvedValue({
        success: true,
        outputs: {},
        error: undefined
      });

      const executor = new WebSocketNodeExecutor();
      const controller = new AbortController();
      const params = { threshold: 0.5 };
      await executor.execute({ nodes: [], edges: [] }, params, controller.signal);

      expect(mockRunInlineGraphJob).toHaveBeenCalledWith(
        expect.objectContaining({
          params,
          signal: controller.signal
        })
      );
    });

    it("propagates failure from the runner", async () => {
      mockRunInlineGraphJob.mockResolvedValue({
        success: false,
        outputs: {},
        error: "Node execution failed"
      });

      const executor = new WebSocketNodeExecutor();
      const result = await executor.execute({ nodes: [], edges: [] });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Node execution failed");
    });
  });
});
