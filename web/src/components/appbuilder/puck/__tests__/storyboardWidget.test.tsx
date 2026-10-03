import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";

let boundValue: unknown = null;

jest.mock("../useWidgetRuntime", () => ({
  useWidgetRuntime: () => ({ value: boundValue, designMode: false })
}));

jest.mock("../../../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: () => "ready"
}));

jest.mock("../../../storyboard/StoryboardBoard", () => ({
  __esModule: true,
  default: ({ boardId, readOnly }: { boardId: string; readOnly?: boolean }) => (
    <div data-testid="board">{`${boardId}:${String(readOnly)}`}</div>
  )
}));

import { StoryboardWidget, getStoryboardId } from "../StoryboardWidget";

const renderWidget = () =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <StoryboardWidget id="output-storyboardId" binding="var:storyboardId" />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("getStoryboardId", () => {
  it("reads a plain id, a storyboard ref, and the last of a list", () => {
    expect(getStoryboardId("sb1")).toBe("sb1");
    expect(getStoryboardId({ type: "storyboard", id: "sb2" })).toBe("sb2");
    expect(getStoryboardId(["sb1", "sb3"])).toBe("sb3");
  });

  it("refuses values that name no storyboard", () => {
    expect(getStoryboardId("  ")).toBeNull();
    expect(getStoryboardId({ type: "timeline", id: "t1" })).toBeNull();
    expect(getStoryboardId(null)).toBeNull();
  });
});

describe("StoryboardWidget", () => {
  it("renders the bound board read only, not its id as JSON", async () => {
    boundValue = "sb1";
    renderWidget();
    expect(await screen.findByTestId("board")).toHaveTextContent("sb1:true");
    expect(screen.getByText("Open storyboard")).toHaveAttribute(
      "href",
      "/studio/storyboard/sb1"
    );
  });

  it("shows the placeholder before a plan runs", () => {
    boundValue = "";
    renderWidget();
    expect(screen.getByText("No storyboard yet")).toBeInTheDocument();
  });
});
