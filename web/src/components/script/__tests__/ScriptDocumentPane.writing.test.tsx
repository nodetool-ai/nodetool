/**
 * While the assistant writes the script, the lines lock. The write replaces
 * every line with what the writer returns, so anything typed meanwhile used
 * to be thrown away when it landed.
 */
import { act, render, screen } from "@testing-library/react";
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
import { undoScript } from "../../../stores/script/timelineSync";
import {
  activeWrites,
  notifyWrites
} from "../../../hooks/script/scriptWrites";
import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-writing";

const seed = (): void => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [],
    sections: [
      {
        id: "s1",
        lines: [{ id: "line-a", text: "Hello there.", takes: [] }]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
};

const startWrite = (): void => {
  act(() => {
    activeWrites.set(SCRIPT_ID, {
      controller: new AbortController(),
      owner: Symbol("test")
    });
    notifyWrites();
  });
};

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

const lineField = (): HTMLTextAreaElement =>
  document.querySelector<HTMLTextAreaElement>(
    '[data-script-line="line-a"]'
  ) as HTMLTextAreaElement;

describe("ScriptDocumentPane while a write runs", () => {
  beforeEach(seed);
  afterEach(() => {
    activeWrites.clear();
    notifyWrites();
  });

  it("locks the lines and unlocks them when the write ends", () => {
    renderPane();
    expect(lineField().disabled).toBe(false);

    startWrite();
    expect(lineField().disabled).toBe(true);
    expect(screen.queryByText("Add line")).not.toBeInTheDocument();

    act(() => {
      activeWrites.delete(SCRIPT_ID);
      notifyWrites();
    });
    expect(lineField().disabled).toBe(false);
  });

  it("does not step undo history under a running write", () => {
    useScriptStore.getState().patchLine(SCRIPT_ID, "line-a", { text: "Typed" });
    startWrite();
    undoScript(SCRIPT_ID);
    expect(
      useScriptStore.getState().scripts[SCRIPT_ID].sections[0].lines[0].text
    ).toBe("Typed");
  });
});
