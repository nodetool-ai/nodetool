import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const useTimelineQuery = jest.fn();
const useJsScriptQuery = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    timeline: { get: { useQuery: (...args: unknown[]) => useTimelineQuery(...args) } },
    jsScripts: { get: { useQuery: (...args: unknown[]) => useJsScriptQuery(...args) } }
  },
  trpcClient: {}
}));

import TimelineScriptLinkChip from "../TimelineScriptLinkChip";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const timeline = (builtByScriptId: string | null): void => {
  useTimelineQuery.mockReturnValue({ data: { id: "seq", builtByScriptId } });
};

const script = (row: { id: string; name: string } | null): void => {
  useJsScriptQuery.mockReturnValue({ data: row });
};

const renderChip = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineScriptLinkChip sequenceId="seq" />
    </ThemeProvider>
  );

describe("TimelineScriptLinkChip", () => {
  beforeEach(() => {
    useTimelineQuery.mockReset();
    useJsScriptQuery.mockReset();
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("renders nothing for a timeline nothing scripted wrote", () => {
    timeline(null);
    script(null);

    const { container } = renderChip();

    expect(container).toBeEmptyDOMElement();
  });

  it("names the script a scripted timeline was built from", () => {
    timeline("script-1");
    script({ id: "script-1", name: "Build the Kite cut" });

    renderChip();

    expect(
      screen.getByText("Built from script Build the Kite cut")
    ).toBeInTheDocument();
  });

  it("opens the script when clicked", async () => {
    timeline("script-1");
    script({ id: "script-1", name: "Build the Kite cut" });

    renderChip();
    await userEvent.click(
      screen.getByText("Built from script Build the Kite cut")
    );

    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      type: "jsscript",
      ref: "script-1",
      title: "Build the Kite cut"
    });
  });
});
