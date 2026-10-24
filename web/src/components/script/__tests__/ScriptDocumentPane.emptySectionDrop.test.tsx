/**
 * A line can be dragged into a section that has no lines yet. Drop targets
 * used to render only between existing rows, so an empty section took none.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

import { useScriptStore } from "../../../stores/script/ScriptStore";
import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-drop";

describe("ScriptDocumentPane empty-section drop", () => {
  it("moves a dragged line into an empty section", () => {
    useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
    useScriptStore.getState().loadScript(SCRIPT_ID, {
      title: "Drop",
      cast: [],
      sections: [
        { id: "s1", lines: [{ id: "line-a", text: "Move me.", takes: [] }] },
        { id: "s2", lines: [] }
      ],
      timelineId: null,
      storyboardId: null
    });
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
      </ThemeProvider>
    );

    // No drop zone until a drag starts.
    expect(container.querySelector('[data-empty-section-drop="s2"]')).toBeNull();
    const dataTransfer = { setData: jest.fn(), effectAllowed: "" };
    fireEvent.dragStart(screen.getByLabelText("Drag to reorder line"), {
      dataTransfer
    });
    const zone = container.querySelector('[data-empty-section-drop="s2"]');
    expect(zone).not.toBeNull();
    fireEvent.dragOver(zone as Element, { dataTransfer });
    fireEvent.drop(zone as Element, { dataTransfer });

    const sections = useScriptStore.getState().scripts[SCRIPT_ID].sections;
    expect(sections.map((section) => section.lines.map((l) => l.id))).toEqual([
      [],
      ["line-a"]
    ]);
  });
});
