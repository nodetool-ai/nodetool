import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockUseStoryboards = jest.fn();
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useStoryboards: () => mockUseStoryboards()
}));

const mockOpenTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ openTab: mockOpenTab })
}));

import StoryboardProperty from "../StoryboardProperty";

const renderProperty = (
  value: unknown,
  onChange: jest.Mock
): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <StoryboardProperty
          property={{
            name: "storyboard",
            type: { type: "storyboard", optional: false, type_args: [] },
            default: null,
            title: "Storyboard",
            description: "The board to read.",
            required: false
          }}
          nodeType="nodetool.storyboard.LoadStoryboard"
          nodeId="load_storyboard"
          propertyIndex="0"
          value={value}
          onChange={onChange}
        />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("StoryboardProperty", () => {
  beforeEach(() => {
    mockOpenTab.mockReset();
    mockUseStoryboards.mockReturnValue({
      data: [
        { id: "sb-1", name: "Launch board" },
        { id: "sb-2", name: "" }
      ],
      error: null,
      isLoading: false
    });
  });

  it("lists the boards the workspace holds", async () => {
    const user = userEvent.setup();
    renderProperty(null, jest.fn());

    await user.click(screen.getByRole("combobox"));

    expect(
      screen.getByRole("option", { name: "Launch board" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Untitled storyboard" })
    ).toBeInTheDocument();
  });

  it("writes a read-only StoryboardRef when a board is picked", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderProperty(null, onChange);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Launch board" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "storyboard",
      id: "sb-1",
      data: null
    });
    // §4.2 write contract: a picked ref is never writable.
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("writable");
  });

  it("opens the picked board in the storyboard editor", async () => {
    const user = userEvent.setup();
    renderProperty({ type: "storyboard", id: "sb-1", data: null }, jest.fn());

    await user.click(
      screen.getByRole("button", { name: "Open in storyboard editor" })
    );

    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "sb-1",
      mode: "edit",
      title: "Launch board"
    });
  });

  it("disables the open button with no board picked", () => {
    renderProperty(null, jest.fn());

    expect(
      screen.getByRole("button", { name: "Open in storyboard editor" })
    ).toBeDisabled();
  });
});
