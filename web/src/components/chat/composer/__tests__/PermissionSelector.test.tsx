import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import PermissionSelector from "../PermissionSelector";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { globalWebSocketManager } from "../../../../lib/websocket/GlobalWebSocketManager";

const THREAD_ID = "thread-1";

const renderSelector = (props: { compact?: boolean } = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PermissionSelector threadId={THREAD_ID} {...props} />
    </ThemeProvider>
  );

describe("PermissionSelector", () => {
  beforeEach(() => {
    // The store is the assertion target, so it stays real; only the socket the
    // mode change is mirrored over is stubbed.
    jest
      .spyOn(globalWebSocketManager, "send")
      .mockResolvedValue(undefined as never);
    useGlobalChatStore.setState({
      currentThreadId: THREAD_ID,
      permissionMode: {},
      lastPermissionMode: "default",
      pendingApprovals: {}
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the active mode on the trigger", () => {
    useGlobalChatStore.setState({ permissionMode: { [THREAD_ID]: "plan" } });

    renderSelector();

    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
  });

  it("lists the three modes and checks the active one", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole("button", { name: "Default" }));

    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Plan"),
      expect.stringContaining("Default"),
      expect.stringContaining("Auto")
    ]);
    expect(items[0]).toHaveAttribute("aria-checked", "false");
    expect(items[1]).toHaveAttribute("aria-checked", "true");
    expect(items[2]).toHaveAttribute("aria-checked", "false");
  });

  it("writes the picked mode to the thread and closes the menu", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole("button", { name: "Default" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Auto/ }));

    expect(useGlobalChatStore.getState().getPermissionMode(THREAD_ID)).toBe(
      "auto"
    );
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("drops the label when compact but keeps an accessible name", () => {
    renderSelector({ compact: true });

    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Permission: Default/ })
    ).toBeInTheDocument();
  });
});
