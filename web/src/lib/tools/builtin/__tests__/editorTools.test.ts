import { setEditorAdapter, EditorAdapter } from "../editorTools";
import { FrontendToolRegistry } from "../../frontendTools";

function makeAdapter(overrides: Partial<EditorAdapter> = {}): EditorAdapter {
  return {
    getContent: jest.fn().mockReturnValue("hello world"),
    getSelection: jest.fn().mockReturnValue(""),
    replaceAll: jest.fn(),
    replaceSelection: jest.fn(),
    insert: jest.fn(),
    language: "javascript",
    ...overrides
  };
}

const callTool = (name: string, args: Record<string, unknown> = {}) =>
  FrontendToolRegistry.call(name, args, `call-${Date.now()}`, {
    getState: () => ({}) as never
  });

describe("editorTools", () => {
  afterEach(() => {
    setEditorAdapter(null);
  });

  it("tools throw when no adapter is set", async () => {
    setEditorAdapter(null);
    await expect(callTool("ui_editor_get_content")).rejects.toThrow(
      "No editor is currently open"
    );
  });

  describe("ui_editor_get_content", () => {
    it("returns document content and language", async () => {
      const adapter = makeAdapter({ language: "typescript" });
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_get_content")) as {
        content: string;
        language: string;
      };

      expect(result.content).toBe("hello world");
      expect(result.language).toBe("typescript");
      expect(adapter.getContent).toHaveBeenCalled();
    });
  });

  describe("ui_editor_get_selection", () => {
    it("returns empty selection when nothing is selected", async () => {
      setEditorAdapter(makeAdapter());

      const result = (await callTool("ui_editor_get_selection")) as {
        selection: string;
      };

      expect(result.selection).toBe("");
    });

    it("returns selected text", async () => {
      const adapter = makeAdapter({
        getSelection: jest.fn().mockReturnValue("selected text")
      });
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_get_selection")) as {
        selection: string;
      };

      expect(result.selection).toBe("selected text");
    });
  });

  describe("ui_editor_replace_all", () => {
    it("replaces entire document content", async () => {
      const adapter = makeAdapter();
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_replace_all", {
        content: "new content"
      })) as { ok: boolean; chars: number };

      expect(result.ok).toBe(true);
      expect(result.chars).toBe(11);
      expect(adapter.replaceAll).toHaveBeenCalledWith("new content");
    });
  });

  describe("ui_editor_replace_selection", () => {
    it("replaces selection when text is selected", async () => {
      const adapter = makeAdapter({
        getSelection: jest.fn().mockReturnValue("old text")
      });
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_replace_selection", {
        text: "replacement"
      })) as { ok: boolean; replaced_selection: boolean };

      expect(result.ok).toBe(true);
      expect(result.replaced_selection).toBe(true);
      expect(adapter.replaceSelection).toHaveBeenCalledWith("replacement");
    });

    it("inserts at cursor when no selection", async () => {
      const adapter = makeAdapter({
        getSelection: jest.fn().mockReturnValue("")
      });
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_replace_selection", {
        text: "inserted"
      })) as { ok: boolean; replaced_selection: boolean };

      expect(result.ok).toBe(true);
      expect(result.replaced_selection).toBe(false);
      expect(adapter.insert).toHaveBeenCalledWith("inserted");
    });
  });

  describe("ui_editor_insert", () => {
    it("inserts text at cursor position", async () => {
      const adapter = makeAdapter();
      setEditorAdapter(adapter);

      const result = (await callTool("ui_editor_insert", {
        text: "new text"
      })) as { ok: boolean; chars: number };

      expect(result.ok).toBe(true);
      expect(result.chars).toBe(8);
      expect(adapter.insert).toHaveBeenCalledWith("new text");
    });
  });

  describe("tool registration", () => {
    it("registers all 5 editor tools", () => {
      const tools = [
        "ui_editor_get_content",
        "ui_editor_get_selection",
        "ui_editor_replace_all",
        "ui_editor_replace_selection",
        "ui_editor_insert"
      ];
      for (const name of tools) {
        expect(FrontendToolRegistry.has(name)).toBe(true);
      }
    });
  });
});
