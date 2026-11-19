import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { CloudAccountState } from "../../../window";
import CloudAccountSettings from "../CloudAccountSettings";

const mockCount = jest.fn();
jest.mock("../../../lib/cloud/waitingDrafts", () => ({
  countCloudDrafts: (...args: unknown[]) => mockCount(...args)
}));

jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>
}));

const signedOut: CloudAccountState = {
  available: true,
  state: "signedOut",
  displayName: "",
  accountId: "",
  serverOrigin: "https://api.nodetool.ai",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: ""
};

type Bridge = NonNullable<NonNullable<Window["api"]>["cloudAccount"]>;

function installBridge(initial: CloudAccountState) {
  let listener: ((state: CloudAccountState) => void) | null = null;
  const bridge: Bridge = {
    state: jest.fn(async () => initial),
    signIn: jest.fn(async () => {}),
    cancelSignIn: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    onChange: jest.fn((callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    })
  };
  (window as unknown as { api: unknown }).api = { cloudAccount: bridge };
  return { bridge, push: (state: CloudAccountState) => listener?.(state) };
}

function renderSection() {
  return render(
    <ThemeProvider theme={mockTheme}>
      <CloudAccountSettings />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockCount.mockReset();
  mockCount.mockResolvedValue({ waiting: 0, unsent: 0 });
});

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
});

describe("CloudAccountSettings", () => {
  it("renders nothing without the desktop bridge", () => {
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("signs in from the signed-out state", async () => {
    const { bridge } = installBridge(signedOut);
    renderSection();
    const button = await screen.findByRole("button", { name: "Sign in" });
    await userEvent.click(button);
    expect(bridge.signIn).toHaveBeenCalledTimes(1);
  });

  it("follows a sign-in made in another app and offers sign-out", async () => {
    const { bridge, push } = installBridge(signedOut);
    renderSection();
    await screen.findByRole("button", { name: "Sign in" });
    act(() => push({ ...signedOut, state: "signedIn", displayName: "Ada" }));
    const button = await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getByText(/stay on this computer/)).toBeInTheDocument();
    await userEvent.click(button);
    expect(bridge.signOut).toHaveBeenCalledTimes(1);
  });

  it("offers no action when the helper is missing", async () => {
    installBridge({ ...signedOut, available: false });
    renderSection();
    await waitFor(() =>
      expect(screen.getByText("Cloud sign-in is not available in this build.")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("sign-out with changes not sent (FR30)", () => {
    const signedIn: CloudAccountState = { ...signedOut, state: "signedIn", displayName: "Ada", accountId: "u1" };

    it("keeps the changes on this computer and signs out", async () => {
      mockCount.mockResolvedValue({ waiting: 2, unsent: 0 });
      const { bridge } = installBridge(signedIn);
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(await screen.findByText("2 cloud documents have changes that were not sent yet.")).toBeInTheDocument();
      expect(bridge.signOut).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Keep on this computer and sign out" }));
      expect(bridge.signOut).toHaveBeenCalledTimes(1);
      expect(mockCount).toHaveBeenCalledWith(expect.objectContaining({ accountId: "u1" }));
    });

    it("cancels without signing out", async () => {
      mockCount.mockResolvedValue({ waiting: 1, unsent: 1 });
      const { bridge } = installBridge(signedIn);
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(await screen.findByText("The server refused the changes to 1 cloud document.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(screen.queryByText("Changes not sent yet")).not.toBeInTheDocument()
      );
      expect(bridge.signOut).not.toHaveBeenCalled();
    });

    it("waits until the changes are sent, then signs out", async () => {
      mockCount.mockResolvedValueOnce({ waiting: 1, unsent: 0 }).mockResolvedValue({ waiting: 0, unsent: 0 });
      const { bridge } = installBridge(signedIn);
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      await userEvent.click(await screen.findByRole("button", { name: "Wait until sent" }));
      expect(bridge.signOut).not.toHaveBeenCalled();
      await waitFor(() => expect(bridge.signOut).toHaveBeenCalledTimes(1), { timeout: 4000 });
    });

    it("offers no wait when only refused changes remain", async () => {
      mockCount.mockResolvedValue({ waiting: 0, unsent: 1 });
      installBridge(signedIn);
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      await screen.findByText("The server refused the changes to 1 cloud document.");
      expect(screen.queryByRole("button", { name: "Wait until sent" })).not.toBeInTheDocument();
    });

    it("asks when the local server does not answer", async () => {
      mockCount.mockResolvedValue(null);
      const { bridge } = installBridge(signedIn);
      renderSection();
      await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(
        await screen.findByText("NodeTool could not check for changes that were not sent yet.")
      ).toBeInTheDocument();
      expect(bridge.signOut).not.toHaveBeenCalled();
    });
  });
});
