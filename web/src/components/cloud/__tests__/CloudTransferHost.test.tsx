import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { MenuProvider } from "../../../providers/MenuProvider";
import type { CloudAccountState, MenuEventData } from "../../../window";
import CloudTransferHost from "../CloudTransferHost";

const PROJECT = "0123456789abcdef0123456789abcdef";

let mockAccount: CloudAccountState | null = null;
jest.mock("../../../lib/cloud/cloudAccount", () => ({
  useCloudAccountState: () => mockAccount,
  cloudOriginOf: (state: CloudAccountState | null) =>
    state?.state === "signedIn" ? { kind: "cloud", server: state.serverOrigin, accountId: state.accountId } : null
}));

let mockProjectId: string | null = PROJECT;
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: { activeProjectId: string | null }) => unknown) =>
    selector({ activeProjectId: mockProjectId })
}));

jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: PROJECT, name: "Film" }] })
}));

const signedIn: CloudAccountState = {
  available: true,
  state: "signedIn",
  displayName: "Ada",
  accountId: "u1",
  serverOrigin: "https://cloud.example",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: ""
};

function installApi() {
  let menuHandler: ((data: MenuEventData) => void) | null = null;
  const transfer = jest.fn(async () => ({ status: "offline" as const, reason: "", data: null }));
  const setMenuCloudTransfer = jest.fn();
  (window as unknown as { api: unknown }).api = {
    onMenuEvent: (callback: (data: MenuEventData) => void) => {
      menuHandler = callback;
    },
    unregisterMenuEvent: jest.fn(),
    setMenuCloudTransfer,
    cloud: { transfer }
  };
  return { transfer, setMenuCloudTransfer, send: (data: MenuEventData) => menuHandler?.(data) };
}

const renderHost = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MenuProvider>
        <CloudTransferHost />
      </MenuProvider>
    </ThemeProvider>
  );

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
  mockProjectId = PROJECT;
});

describe("CloudTransferHost", () => {
  it("enables the menu entries for a project folder while signed in, and opens the sheet", async () => {
    mockAccount = signedIn;
    const api = installApi();
    renderHost();
    expect(api.setMenuCloudTransfer).toHaveBeenLastCalledWith(true);

    await act(async () => {
      api.send({ type: "synchronizeProject" });
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The sheet reads the link first and names the project.
    expect(api.transfer).toHaveBeenCalledWith({
      procedure: "cloudTransfer.link",
      input: { project_id: PROJECT }
    });
  });

  it("keeps the menu entries off while signed out or without a project folder", async () => {
    mockAccount = { ...signedIn, state: "signedOut" };
    const api = installApi();
    const { unmount } = renderHost();
    expect(api.setMenuCloudTransfer).toHaveBeenLastCalledWith(false);
    await act(async () => {
      api.send({ type: "publishToCloud" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.transfer).not.toHaveBeenCalled();
    unmount();

    mockAccount = signedIn;
    mockProjectId = "default";
    const again = installApi();
    renderHost();
    expect(again.setMenuCloudTransfer).toHaveBeenLastCalledWith(false);
  });
});
