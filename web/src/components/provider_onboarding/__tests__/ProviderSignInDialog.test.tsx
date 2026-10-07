import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ProviderSignInDialog from "../ProviderSignInDialog";
import {
  SIGN_IN_PROVIDERS,
  useProviderSignInStore
} from "../../../stores/ProviderSignInStore";
import {
  useOAuthConnection,
  type OAuthConnection
} from "../../../hooks/useOAuthConnection";

jest.mock("../../../hooks/useOAuthConnection");

const mockUseOAuthConnection = useOAuthConnection as jest.MockedFunction<
  typeof useOAuthConnection
>;

const connection = (overrides: Partial<OAuthConnection> = {}): OAuthConnection => ({
  label: "OpenAI",
  isConnected: true,
  isConnecting: false,
  canDisconnect: true,
  connect: jest.fn(async () => undefined),
  disconnect: jest.fn(async () => undefined),
  manualPrompt: null,
  isSubmittingManual: false,
  submitManualCode: jest.fn(async () => undefined),
  cancelManual: jest.fn(),
  ...overrides
});

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProviderSignInDialog />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useProviderSignInStore.getState().dismiss();
});

describe("ProviderSignInDialog", () => {
  it("renders nothing while no sign-in is pending", () => {
    mockUseOAuthConnection.mockReturnValue(connection());
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockUseOAuthConnection).toHaveBeenCalledWith(null, expect.anything());
  });

  it("starts the Codex login from the dialog", async () => {
    const codex = connection();
    mockUseOAuthConnection.mockReturnValue(codex);
    useProviderSignInStore.getState().show(SIGN_IN_PROVIDERS.codex);
    renderDialog();

    expect(screen.getByText("Sign in to Codex again")).toBeInTheDocument();
    expect(mockUseOAuthConnection).toHaveBeenCalledWith(
      "openai",
      expect.anything()
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with ChatGPT" })
    );
    expect(codex.connect).toHaveBeenCalled();
  });

  it("closes once the Claude login stores a fresh token", () => {
    mockUseOAuthConnection.mockReturnValue(connection({ label: "Claude" }));
    useProviderSignInStore.getState().show(SIGN_IN_PROVIDERS.claude_agent_sdk);
    renderDialog();

    const options = mockUseOAuthConnection.mock.calls.at(-1)?.[1];
    expect(mockUseOAuthConnection.mock.calls.at(-1)?.[0]).toBe("claude");
    options?.onConnected?.();
    expect(useProviderSignInStore.getState().provider).toBeNull();
  });
});
