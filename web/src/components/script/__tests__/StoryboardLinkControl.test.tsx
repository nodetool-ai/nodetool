import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../../../hooks/script/useDeriveStoryboard", () => ({
  useDeriveStoryboard: () => ({
    derive: jest.fn().mockResolvedValue({}),
    deriving: false,
    error: null
  })
}));

import StoryboardLinkControl from "../StoryboardLinkControl";
import { useScriptStore } from "../../../stores/script/ScriptStore";

const SCRIPT = "link-script";

const renderControl = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardLinkControl scriptId={SCRIPT} />
    </ThemeProvider>
  );

describe("StoryboardLinkControl", () => {
  beforeEach(() => {
    useScriptStore.setState({ storyboardLinks: {} });
    useScriptStore.getState().ensureScript(SCRIPT);
  });

  it("offers Create storyboard while the script links none", () => {
    renderControl();

    expect(
      screen.getByRole("button", { name: /create storyboard/i })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /open storyboard/i })
    ).toBeNull();
  });

  it("offers Open storyboard once one is linked", () => {
    useScriptStore.getState().setStoryboardLink(SCRIPT, "board-3");
    renderControl();

    expect(
      screen.getByRole("button", { name: /open storyboard/i })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /create storyboard/i })
    ).toBeNull();
  });
});
