import React from "react";
import { asMock, stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ProviderOnboardingDialog from "../ProviderOnboardingDialog";
import useProviderOnboardingStore from "../../../stores/ProviderOnboardingStore";
import { useSecrets } from "../../../hooks/useSecrets";
import { navigateTo } from "../../../lib/appNavigation";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useSettingsPageStore } from "../../../stores/SettingsPageStore";
import { useOAuthConnection } from "../../../hooks/useOAuthConnection";
import useSecretsStore from "../../../stores/SecretsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../stores/ProviderOnboardingStore");
jest.mock("../../../hooks/useSecrets");
jest.mock("../../../lib/appNavigation");
jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../stores/SecretsStore");
jest.mock("../../../stores/NotificationStore");

const mockUseProviderOnboardingStore =
  asMock(useProviderOnboardingStore);
const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;
const mockNavigateTo = navigateTo as jest.MockedFunction<typeof navigateTo>;
const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;
const mockUseSecretsStore = asMock(useSecretsStore);
const mockUseNotificationStore = asMock(useNotificationStore);

const dismiss = jest.fn();

const storeState = {
  open: true,
  capability: null,
  reason: null,
  highlightSecretKey: null,
  dismiss
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProviderOnboardingStore.mockImplementation(
    <T,>(selector: (s: unknown) => T) => selector(storeState)
  );
  mockUseSecrets.mockReturnValue(stub<ReturnType<typeof useSecrets>>({
    secrets: [],
    isLoading: false,
    isSuccess: true,
    isApiKeySet: () => false
  }));
  mockUseOAuthConnection.mockReturnValue({
    label: "",
    isConnected: false,
    isConnecting: false,
    canDisconnect: false,
    connect: jest.fn(),
    disconnect: jest.fn()
  });
  mockUseSecretsStore.mockImplementation(<T,>(selector: (s: unknown) => T) =>
    selector({ updateSecret: jest.fn() })
  );
  mockUseNotificationStore.mockImplementation(
    <T,>(selector: (s: unknown) => T) => selector({ addNotification: jest.fn() })
  );
});

const renderDialog = () =>
  render(
    // Intentionally NOT wrapped in a Router — this dialog is mounted as a
    // sibling of <RouterProvider>, so it must not depend on router context.
    <ThemeProvider theme={mockTheme}>
      <ProviderOnboardingDialog />
    </ThemeProvider>
  );

describe("ProviderOnboardingDialog", () => {
  it("renders outside a Router without crashing", () => {
    renderDialog();
    expect(screen.getByText("Connect an AI provider")).toBeInTheDocument();
  });

  it("opens the settings tab via the router singleton, not useNavigate", async () => {
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    renderDialog();
    await userEvent.click(
      screen.getByRole("button", { name: /see all providers in settings/i })
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigateTo).toHaveBeenCalledWith("/workspace");
    expect(useWorkspaceTabsStore.getState().tabs).toEqual([
      expect.objectContaining({ type: "page", ref: "settings" })
    ]);
    expect(useSettingsPageStore.getState().section).toBe("providers");
  });
});
