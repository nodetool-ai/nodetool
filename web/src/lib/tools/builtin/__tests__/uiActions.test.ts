import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import type { Workflow } from "../../../../stores/ApiTypes";

// Mock protocol param exports — they are plain z.object shape records;
// the real ones are resolved via moduleNameMapper but we still need
// the module to exist so `uiActions.ts` can import it.
jest.mock("@nodetool-ai/protocol", () => ({
  uiOpenWorkflowParams: {
    workflow_id: jest.requireActual("zod").z.string()
  },
  uiRunWorkflowParams: {
    workflow_id: jest.requireActual("zod").z.string(),
    params: jest
      .requireActual("zod")
      .z.record(
        jest.requireActual("zod").z.string(),
        jest.requireActual("zod").z.unknown()
      )
      .optional()
  },
  uiSwitchTabParams: {
    tab_index: jest.requireActual("zod").z.number().int().min(0)
  },
  uiCopyParams: {
    text: jest.requireActual("zod").z.string()
  }
}));

const mockRunFn = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: () => ({
    getState: () => ({
      run: mockRunFn
    })
  })
}));

// Side-effect import: registers the 5 tools with FrontendToolRegistry
import "../uiActions";
import {
  frontendToolContext,
  frontendToolState
} from "../../../../test-utils/frontendToolDoubles";
import { stub } from "../../../../test-utils/doubles";

describe("uiActions", () => {
  describe("ui_open_workflow", () => {
    it("calls openWorkflow when available", async () => {
      const openWorkflow = jest.fn(async () => {});
      const state = frontendToolState({ openWorkflow });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_open_workflow",
        { workflow_id: "wf-1" },
        "call-1",
        ctx
      );

      expect(openWorkflow).toHaveBeenCalledWith("wf-1");
      expect(result).toEqual({ ok: true, workflow_id: "wf-1" });
    });

    it("falls back to fetchWorkflow + setCurrentWorkflowId", async () => {
      const fetchWorkflow = jest.fn(async () => {});
      const getWorkflow = jest.fn(() => stub<Workflow>({ id: "wf-2" }));
      const setCurrentWorkflowId = jest.fn();
      const state = frontendToolState({
        fetchWorkflow,
        getWorkflow,
        setCurrentWorkflowId
      });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_open_workflow",
        { workflow_id: "wf-2" },
        "call-2",
        ctx
      );

      expect(fetchWorkflow).toHaveBeenCalledWith("wf-2");
      expect(getWorkflow).toHaveBeenCalledWith("wf-2");
      expect(setCurrentWorkflowId).toHaveBeenCalledWith("wf-2");
      expect(result).toEqual({ ok: true, workflow_id: "wf-2" });
    });

    it("throws when workflow not found on fallback path", async () => {
      const state = frontendToolState({
        fetchWorkflow: jest.fn(async () => {}),
        getWorkflow: jest.fn(() => undefined)
      });
      const ctx = frontendToolContext(state);

      await expect(
        FrontendToolRegistry.call(
          "ui_open_workflow",
          { workflow_id: "missing" },
          "call-3",
          ctx
        )
      ).rejects.toThrow("Workflow not found: missing");
    });
  });

  describe("ui_switch_tab", () => {
    it("calls switchTab when available", async () => {
      const switchTab = jest.fn(async () => "wf-tab-1");
      const state = frontendToolState({ switchTab });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_switch_tab",
        { tab_index: 0 },
        "call-4",
        ctx
      );

      expect(switchTab).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        ok: true,
        tab_index: 0,
        workflow_id: "wf-tab-1"
      });
    });

    it("falls back to getOpenWorkflowIds + setCurrentWorkflowId", async () => {
      const setCurrentWorkflowId = jest.fn();
      const state = frontendToolState({
        getOpenWorkflowIds: () => ["wf-a", "wf-b", "wf-c"],
        setCurrentWorkflowId
      });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_switch_tab",
        { tab_index: 1 },
        "call-5",
        ctx
      );

      expect(setCurrentWorkflowId).toHaveBeenCalledWith("wf-b");
      expect(result).toEqual({
        ok: true,
        tab_index: 1,
        workflow_id: "wf-b"
      });
    });

    it("throws on out-of-range tab index", async () => {
      const state = frontendToolState({
        getOpenWorkflowIds: () => ["wf-only"]
      });
      const ctx = frontendToolContext(state);

      await expect(
        FrontendToolRegistry.call(
          "ui_switch_tab",
          { tab_index: 5 },
          "call-6",
          ctx
        )
      ).rejects.toThrow("Tab index 5 is out of range (open tabs: 1)");
    });
  });

  describe("ui_copy", () => {
    it("copies text using copyToClipboard callback", async () => {
      const copyToClipboard = jest.fn(async () => {});
      const state = frontendToolState({ copyToClipboard });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_copy",
        { text: "hello world" },
        "call-7",
        ctx
      );

      expect(copyToClipboard).toHaveBeenCalledWith("hello world");
      expect(result).toEqual({ ok: true, text_length: 11 });
    });
  });

  describe("ui_paste", () => {
    it("pastes text using pasteFromClipboard callback", async () => {
      const pasteFromClipboard = jest.fn(async () => "pasted content");
      const state = frontendToolState({ pasteFromClipboard });
      const ctx = frontendToolContext(state);

      const result = await FrontendToolRegistry.call(
        "ui_paste",
        {},
        "call-8",
        ctx
      );

      expect(pasteFromClipboard).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, text: "pasted content" });
    });
  });
});
