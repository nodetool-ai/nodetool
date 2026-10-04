import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";

let boundValue: unknown = null;
const syncCalls: unknown[][] = [];

jest.mock("../useWidgetRuntime", () => ({
  useWidgetRuntime: () => ({ value: boundValue, designMode: false })
}));

jest.mock("../../../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: (...args: unknown[]) => {
    syncCalls.push(args);
    return "ready";
  }
}));

jest.mock("../../../storyboard/StoryboardPreview", () => ({
  __esModule: true,
  default: ({ boardId, height }: { boardId: string; height?: number }) => (
    <div data-testid="preview">{`${boardId}:${String(height)}`}</div>
  )
}));

import { StoryboardPreviewWidget } from "../StoryboardPreviewWidget";

const renderWidget = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardPreviewWidget
        id="output-storyboardId"
        binding="var:storyboardId"
        height={320}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  syncCalls.length = 0;
});

describe("StoryboardPreviewWidget", () => {
  it("plays the bound board and loads it read only", async () => {
    boundValue = { type: "storyboard", id: "sb1" };
    renderWidget();
    expect(await screen.findByTestId("preview")).toHaveTextContent("sb1:320");
    expect(syncCalls[0]).toEqual(["sb1", 0, { readOnly: true }]);
    expect(screen.queryByText("Open storyboard")).not.toBeInTheDocument();
  });

  it("shows the placeholder before a plan runs", () => {
    boundValue = "";
    renderWidget();
    expect(screen.getByText("No storyboard yet")).toBeInTheDocument();
    expect(syncCalls).toHaveLength(0);
  });
});
