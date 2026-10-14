import { asMock } from "../../../test-utils/doubles";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import SubscriptionOnboardingDialog, {
  subscriptionProviders
} from "../SubscriptionOnboardingDialog";
import useSubscriptionOnboardingStore from "../../../stores/SubscriptionOnboardingStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import {
  useExtensionStatus,
  useInstallExtensionHost
} from "../../../serverState/useExtensionStatus";
import { useOAuthConnection } from "../../../hooks/useOAuthConnection";
import useSecretsStore from "../../../stores/SecretsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../stores/ProviderOnboardingStore");
jest.mock("../../../serverState/useExtensionStatus");
jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../stores/SecretsStore");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../../lib/env", () => ({ isElectron: false, isLocalhost: true }));

const mockUseExtensionStatus = jest.mocked(useExtensionStatus);
const mockUseInstallExtensionHost = jest.mocked(useInstallExtensionHost);
const install = jest.fn();
const mockOpenProviderOnboarding = jest.mocked(openProviderOnboarding);

const extensionStatus = (
  connected: boolean,
  overrides: Partial<{ hostInstalled: boolean; distPath: string; distExists: boolean }> = {}
) => ({
  status: { connected, hostInstalled: connected, distPath: "", distExists: false, ...overrides },
  isLoading: false
});

const installState = (
  overrides: Partial<ReturnType<typeof useInstallExtensionHost>> = {}
): ReturnType<typeof useInstallExtensionHost> => ({
  install,
  isInstalling: false,
  error: null,
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  useSubscriptionOnboardingStore.setState({ open: true, step: "subscriptions" });
  mockUseExtensionStatus.mockReturnValue(extensionStatus(false));
  mockUseInstallExtensionHost.mockReturnValue(installState());
  jest.mocked(useOAuthConnection).mockReturnValue({
    label: "",
    isConnected: false,
    isConnecting: false,
    canDisconnect: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    manualPrompt: null,
    isSubmittingManual: false,
    submitManualCode: jest.fn(),
    cancelManual: jest.fn()
  });
  asMock(useSecretsStore).mockImplementation(
    <T,>(selector: (s: { updateSecret: jest.Mock; validateSecret: jest.Mock }) => T) =>
      selector({ updateSecret: jest.fn(), validateSecret: jest.fn() })
  );
  asMock(useNotificationStore).mockImplementation(
    <T,>(selector: (s: { addNotification: jest.Mock }) => T) =>
      selector({ addNotification: jest.fn() })
  );
});

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SubscriptionOnboardingDialog />
    </ThemeProvider>
  );

describe("subscriptionProviders", () => {
  it("lists ChatGPT and Claude as sign-ins only", () => {
    const providers = subscriptionProviders();
    expect(providers.map((p) => p.name)).toEqual(["ChatGPT", "Claude"]);
    expect(providers.map((p) => p.oauth)).toEqual(["openai", "claude"]);
    expect(providers.every((p) => p.oauthOnly)).toBe(true);
  });
});

describe("SubscriptionOnboardingDialog", () => {
  it("renders nothing while closed", () => {
    useSubscriptionOnboardingStore.setState({ open: false });
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers ChatGPT and Claude sign-ins and points Gemini at the extension", () => {
    renderDialog();
    expect(screen.getByText("Connect your AI subscriptions")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /sign in/i })).toHaveLength(2);
    // A subscription page has no API-key field.
    expect(screen.queryByRole("button", { name: /^(use|add) api key$/i })).toBeNull();
    expect(screen.getByRole("article", { name: "Gemini" })).toBeInTheDocument();
  });

  it("moves to the extension step from the Gemini row", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(useSubscriptionOnboardingStore.getState().step).toBe("extension");
    expect(screen.getByText("Add the Chrome extension")).toBeInTheDocument();
  });

  it("shows Gemini as ready once the extension is connected", () => {
    mockUseExtensionStatus.mockReturnValue(extensionStatus(true));
    renderDialog();
    expect(screen.queryByRole("button", { name: "Set up" })).toBeNull();
    expect(screen.getByText("Extension connected")).toBeInTheDocument();
  });

  it("explains the extension and how to set it up", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Next: Chrome extension" }));
    expect(screen.getByText("Why add it")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download extension" })).toBeInTheDocument();
    expect(screen.getByText("Extension not connected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Connect your AI subscriptions")).toBeInTheDocument();
  });

  it("registers the browser bridge itself when it is missing", () => {
    act(() => useSubscriptionOnboardingStore.setState({ step: "extension" }));
    const { rerender } = renderDialog();
    expect(install).toHaveBeenCalledTimes(1);
    rerender(
      <ThemeProvider theme={mockTheme}>
        <SubscriptionOnboardingDialog />
      </ThemeProvider>
    );
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("leaves a registered bridge alone and says so", () => {
    mockUseExtensionStatus.mockReturnValue(extensionStatus(false, { hostInstalled: true }));
    act(() => useSubscriptionOnboardingStore.setState({ step: "extension" }));
    renderDialog();
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByText(/registered its bridge/)).toBeInTheDocument();
  });

  it("shows why registration failed and offers a retry", async () => {
    mockUseInstallExtensionHost.mockReturnValue(
      installState({ error: "No supported browser profile directory found" })
    );
    act(() => useSubscriptionOnboardingStore.setState({ step: "extension" }));
    renderDialog();
    expect(screen.getByText("No supported browser profile directory found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(install).toHaveBeenCalledTimes(2);
  });

  it("points the desktop app at the extension folder it ships", async () => {
    const showItemInFolder = jest.fn();
    window.api = { ...window.api, showItemInFolder } as typeof window.api;
    try {
      mockUseExtensionStatus.mockReturnValue(
        extensionStatus(false, { hostInstalled: true, distPath: "/app/chrome-extension", distExists: true })
      );
      act(() => useSubscriptionOnboardingStore.setState({ step: "extension" }));
      renderDialog();
      expect(screen.queryByRole("button", { name: "Download extension" })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Show extension folder" }));
      expect(showItemInFolder).toHaveBeenCalledWith("/app/chrome-extension");
    } finally {
      delete (window as { api?: unknown }).api;
    }
  });

  it("hands off to the API-key dialog", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Use an API key instead" }));
    expect(mockOpenProviderOnboarding).toHaveBeenCalledTimes(1);
    expect(useSubscriptionOnboardingStore.getState().open).toBe(false);
  });

  it("closes from Done on the last step", async () => {
    act(() => useSubscriptionOnboardingStore.setState({ step: "extension" }));
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useSubscriptionOnboardingStore.getState().open).toBe(false);
  });
});
