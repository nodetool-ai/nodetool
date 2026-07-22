import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ProviderOnboardingDialog from "../ProviderOnboardingDialog";
import useProviderOnboardingStore from "../../../stores/ProviderOnboardingStore";
import { useSecrets } from "../../../hooks/useSecrets";
import { navigateTo } from "../../../lib/appNavigation";
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
  useProviderOnboardingStore as unknown as jest.Mock;
const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;
const mockNavigateTo = navigateTo as jest.MockedFunction<typeof navigateTo>;
const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;
const mockUseSecretsStore = useSecretsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;

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
    (selector: (s: unknown) => unknown) => selector(storeState)
  );
  mockUseSecrets.mockReturnValue({
    secrets: [],
    isLoading: false,
    isSuccess: true,
    isApiKeySet: () => false
  } as unknown as ReturnType<typeof useSecrets>);
  mockUseOAuthConnection.mockReturnValue({
    label: "",
    isConnected: false,
    isConnecting: false,
    canDisconnect: false,
    connect: jest.fn(),
    disconnect: jest.fn()
  });
  mockUseSecretsStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ updateSecret: jest.fn() })
  );
  mockUseNotificationStore.mockImplementation(
    (selector: (s: unknown) => unknown) => selector({ addNotification: jest.fn() })
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

  it("navigates to settings via the router singleton, not useNavigate", async () => {
    renderDialog();
    await userEvent.click(
      screen.getByRole("button", { name: /see all providers in settings/i })
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigateTo).toHaveBeenCalledWith("/settings?tab=1");
  });
});
