import en from "../../../i18n/locales/en.json";
import { GIZMO_TOOL_KEYS } from "../gizmoToolKeys";

describe("GIZMO_TOOL_KEYS", () => {
  it("names a translated tool label for every gizmo mode", () => {
    const tools: Record<string, string> =
      en["i18n-cont-model-editor-11"].modelEditor.tools;
    for (const key of Object.values(GIZMO_TOOL_KEYS)) {
      expect(tools[key]).toEqual(expect.any(String));
    }
    expect(tools[GIZMO_TOOL_KEYS.translate]).toBe("Move");
  });
});
