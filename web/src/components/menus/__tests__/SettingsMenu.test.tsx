import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { useSettingsPageStore } from "../../../stores/SettingsPageStore";

jest.mock("../../../lib/env", () => ({
  isLocalhost: true,
  isElectron: false
}));

jest.mock("../RemoteSettingsMenu", () => ({
  __esModule: true,
  default: () => <div>remote settings</div>,
  getDisplayedSettingGroups: () => []
}));
jest.mock("../FoldersSettingsMenu", () => ({
  __esModule: true,
  default: () => <div>folders settings</div>
}));
jest.mock("../AboutMenu", () => ({
  __esModule: true,
  default: () => <div>about menu</div>
}));
jest.mock("../APIKeysTab", () => ({
  APIKeysTabContent: ({ searchTerm }: { searchTerm?: string }) => (
    <div>providers {searchTerm}</div>
  ),
  APIKeysRightSidebar: () => null,
  SecurityNotice: () => null
}));
jest.mock("../DefaultModelsMenu", () => ({
  __esModule: true,
  default: () => <div>default models</div>
}));
jest.mock("../MCPSettingsMenu", () => ({
  __esModule: true,
  default: () => <div>mcp settings</div>
}));
jest.mock("../BrowserExtensionSettingsMenu", () => ({
  __esModule: true,
  default: () => <div>browser extension</div>
}));
jest.mock("../VaultsSettings", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../settings/ConnectedAccountsSettings", () => ({
  __esModule: true,
  default: () => <div>connected accounts</div>
}));
jest.mock("../../settings/StorageHistorySettings", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../ServerNumberSetting", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (state: { session: null }) => unknown) =>
    selector({ session: null })
}));
jest.mock("../../../stores/RemoteSettingStore", () => ({
  __esModule: true,
  default: (selector: (state: { settings: unknown[] }) => unknown) =>
    selector({ settings: [] })
}));
jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: { secrets: unknown[] }) => unknown) =>
      selector({ secrets: [] }),
    { subscribe: () => () => undefined }
  )
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: { addNotification: jest.Mock }) => unknown) =>
    selector({ addNotification: jest.fn() })
}));

import SettingsPage from "../SettingsMenu";

const renderSettings = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SettingsPage />
    </ThemeProvider>
  );

describe("SettingsPage", () => {
  beforeEach(() => {
    useSettingsPageStore.setState({ section: "general" });
    class FakeIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    global.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it("puts one search field in the header", () => {
    renderSettings();
    expect(
      screen.getByRole("textbox", { name: "Search settings" })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search providers...")
    ).not.toBeInTheDocument();
  });

  it("keeps the query when switching tabs", async () => {
    const user = userEvent.setup();
    renderSettings();
    const search = screen.getByRole("textbox", { name: "Search settings" });
    await user.type(search, "openai");
    await user.click(screen.getByRole("tab", { name: "Models & Providers" }));
    expect(search).toHaveValue("openai");
    expect(screen.getByText("providers openai")).toBeInTheDocument();
  });

  it("points to Providers when a provider name is typed on General", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.type(
      screen.getByRole("textbox", { name: "Search settings" }),
      "openai"
    );
    expect(screen.getByText("No matches in General.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Models & Providers" })
    ).toBeInTheDocument();
  });
});
