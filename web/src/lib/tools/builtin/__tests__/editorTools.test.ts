import type { EditorAdapter } from "../editorTools";
import { setEditorAdapter } from "../editorTools";
import { FrontendToolRegistry } from "../../frontendTools";

const mockState = {
  nodeMetadata: {},
  currentWorkflowId: null,
  getWorkflow: () => undefined,
  addWorkflow: () => {},
  removeWorkflow: () => {},
  getNodeStore: () => undefined,
  updateWorkflow: () => {},
  saveWorkflow: async () => {},
  getCurrentWorkflow: () => undefined,
  setCurrentWorkflowId: () => {},
  fetchWorkflow: async () => {},
  newWorkflow: () => ({}) as any,
  createNew: async () => ({}) as any,
  searchTemplates: async () => ({ workflows: [] }) as any,
  copy: async () => ({}) as any,
};

const ctx = { getState: () => mockState };

function makeAdapter(overrides?: Partial<EditorAdapter>): EditorAdapter {
  return {
    getContent: () => "line 1\nline 2",
    getSelection: () => "",
    replaceAll: jest.fn(),
    replaceSelection: jest.fn(),
    insert: jest.fn(),
    language: "javascript",
    ...overrides,
  };
}

describe("editorTools", () => {
  afterEach(() => {
    setEditorAdapter(null);
  });

  describe("ui_editor_get_content", () => {
    it("returns editor content and language", async () => {
      const adapter = makeAdapter({ getContent: () => "const x = 1;" });
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_get_content",
        {},
        "call-1",
        ctx
      );

      expect(result).toEqual({
        content: "const x = 1;",
        language: "javascript",
      });
    });

    it("throws when no editor is open", async () => {
      await expect(
        FrontendToolRegistry.call("ui_editor_get_content", {}, "call-2", ctx)
      ).rejects.toThrow("No editor is currently open");
    });
  });

  describe("ui_editor_get_selection", () => {
    it("returns selected text", async () => {
      const adapter = makeAdapter({ getSelection: () => "selected text" });
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_get_selection",
        {},
        "call-3",
        ctx
      );

      expect(result).toEqual({ selection: "selected text" });
    });

    it("returns empty string when nothing is selected", async () => {
      setEditorAdapter(makeAdapter());

      const result = await FrontendToolRegistry.call(
        "ui_editor_get_selection",
        {},
        "call-4",
        ctx
      );

      expect(result).toEqual({ selection: "" });
    });
  });

  describe("ui_editor_replace_all", () => {
    it("replaces entire document content", async () => {
      const adapter = makeAdapter();
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_replace_all",
        { content: "new content" },
        "call-5",
        ctx
      );

      expect(adapter.replaceAll).toHaveBeenCalledWith("new content");
      expect(result).toEqual({ ok: true, chars: 11 });
    });
  });

  describe("ui_editor_replace_selection", () => {
    it("replaces selected text when selection exists", async () => {
      const adapter = makeAdapter({ getSelection: () => "old text" });
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_replace_selection",
        { text: "new text" },
        "call-6",
        ctx
      );

      expect(adapter.replaceSelection).toHaveBeenCalledWith("new text");
      expect(result).toEqual({ ok: true, replaced_selection: true });
    });

    it("inserts text when no selection exists", async () => {
      const adapter = makeAdapter({ getSelection: () => "" });
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_replace_selection",
        { text: "inserted" },
        "call-7",
        ctx
      );

      expect(adapter.insert).toHaveBeenCalledWith("inserted");
      expect(result).toEqual({ ok: true, replaced_selection: false });
    });
  });

  describe("ui_editor_insert", () => {
    it("inserts text at cursor position", async () => {
      const adapter = makeAdapter();
      setEditorAdapter(adapter);

      const result = await FrontendToolRegistry.call(
        "ui_editor_insert",
        { text: "console.log();" },
        "call-8",
        ctx
      );

      expect(adapter.insert).toHaveBeenCalledWith("console.log();");
      expect(result).toEqual({ ok: true, chars: 14 });
    });
  });

  describe("setEditorAdapter", () => {
    it("clears adapter so tools throw after disconnect", async () => {
      setEditorAdapter(makeAdapter());
      setEditorAdapter(null);

      await expect(
        FrontendToolRegistry.call("ui_editor_get_content", {}, "call-9", ctx)
      ).rejects.toThrow("No editor is currently open");
    });
  });
});
