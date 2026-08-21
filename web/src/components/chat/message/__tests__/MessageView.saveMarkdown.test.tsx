import { asMock } from "../../../../test-utils/doubles";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import { Message } from "../../../../stores/ApiTypes";
import { useAssetStore } from "../../../../stores/AssetStore";
import { useWorkspaceTabsStore } from "../../../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../../../stores/NotificationStore";

jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) => selector({}))
}));

jest.mock("../../../../contexts/EditorInsertionContext", () => ({
  useEditorInsertion: () => undefined
}));

jest.mock("../../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({ writeClipboard: jest.fn() })
}));

jest.mock("../ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

const renderView = (message: Message) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
      />
    </ThemeProvider>
  );

let unmountView: (() => void) | undefined;

describe("MessageView save markdown asset", () => {
  const originalCreateAsset = useAssetStore.getState().createAsset;
  const originalOpenTab = useWorkspaceTabsStore.getState().openTab;
  const originalAddNotification =
    useNotificationStore.getState().addNotification;

  beforeEach(() => {
    useAssetStore.setState({
      createAsset: jest.fn(async () => ({
        id: "asset-1",
        name: "Hello.md"
      }))
    });
    useWorkspaceTabsStore.setState({
      openTab: jest.fn(() => "text:asset-1")
    });
    useNotificationStore.setState({
      addNotification: jest.fn()
    });
  });

  afterEach(() => {
    unmountView?.();
    unmountView = undefined;
    useAssetStore.setState({ createAsset: originalCreateAsset });
    useWorkspaceTabsStore.setState({ openTab: originalOpenTab });
    useNotificationStore.setState({
      addNotification: originalAddNotification
    });
  });

  it("creates a markdown asset from the message text", async () => {
    const user = userEvent.setup();
    unmountView = renderView({
      id: "m-md",
      role: "assistant",
      content: "# Hello\n\nThis is the body."
    } as Message).unmount;

    await user.click(
      screen.getByRole("button", { name: /save as markdown asset/i })
    );

    const createAsset = asMock(useAssetStore.getState().createAsset);
    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledTimes(1);
    });
    const file = createAsset.mock.calls[0][0] as File;
    expect(file.name).toBe("Hello.md");
    expect(file.type).toBe("text/markdown");
    expect(file.size).toBeGreaterThan(0);

    expect(useWorkspaceTabsStore.getState().openTab).toHaveBeenCalledWith({
      type: "text",
      ref: "asset-1",
      mode: "edit",
      title: "Hello.md"
    });
  });

  it("hides the save button when the message has no text", () => {
    unmountView = renderView({
      id: "m-empty",
      role: "assistant",
      content: "   "
    } as Message).unmount;

    expect(
      screen.queryByRole("button", { name: /save as markdown asset/i })
    ).not.toBeInTheDocument();
  });
});
