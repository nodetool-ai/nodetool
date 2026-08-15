import { model3DEditorHotkey } from "../editorHotkeys";

describe("model3DEditorHotkey", () => {
  it("treats Cmd+S and Ctrl+S as save, not scale", () => {
    expect(
      model3DEditorHotkey({ key: "s", metaKey: true, ctrlKey: false })
    ).toBe("save");
    expect(
      model3DEditorHotkey({ key: "s", metaKey: false, ctrlKey: true })
    ).toBe("save");
    expect(
      model3DEditorHotkey({ key: "S", metaKey: true, ctrlKey: false })
    ).toBe("save");
  });

  it("treats a bare s as scale", () => {
    expect(
      model3DEditorHotkey({ key: "s", metaKey: false, ctrlKey: false })
    ).toBe("scale");
  });

  it("maps the other editor keys", () => {
    expect(
      model3DEditorHotkey({ key: "g", metaKey: false, ctrlKey: false })
    ).toBe("translate");
    expect(
      model3DEditorHotkey({ key: "r", metaKey: false, ctrlKey: false })
    ).toBe("rotate");
    expect(
      model3DEditorHotkey({ key: "Delete", metaKey: false, ctrlKey: false })
    ).toBe("delete");
  });
});
