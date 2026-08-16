import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { useOAuthConnection } from "../../../hooks/useOAuthConnection";

// Hosted deployment: neither the browser nor the server is local.
jest.mock("../../../lib/env", () => ({
  isLocalhost: false,
  isElectron: false
}));
jest.mock("../../../hooks/useOAuthConnection");
jest.mock("../../../hooks/useProviders", () => ({
  useProviders: () => ({
    providers: [],
    isLoading: true,
    isFetching: true,
    error: null
  })
}));
jest.mock("../GoogleWorkspaceCard", () => () => null);
jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: unknown) => T) =>
    selector({
      secrets: [],
      updateSecret: jest.fn(),
      deleteSecret: jest.fn()
    })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (state: unknown) => T) =>
    selector({ addNotification: jest.fn() })
}));

// Imported after the mocks so the module picks up the hosted-env values.
import { APIKeysTabContent } from "../APIKeysTab";

describe("APIKeysTabContent on a hosted deployment", () => {
  beforeEach(() => {
    (useOAuthConnection as jest.MockedFunction<typeof useOAuthConnection>)
      .mockReturnValue({
        label: "",
        isConnected: false,
        isConnecting: false,
        canDisconnect: false,
        connect: jest.fn(),
        disconnect: jest.fn()
      });
  });

  it("hides the Claude subscription card, whose sign-in needs a local server", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <APIKeysTabContent />
      </ThemeProvider>
    );

    expect(
      screen.queryByRole("button", { name: /sign in with claude/i })
    ).not.toBeInTheDocument();
    // The API-key providers are unaffected.
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });
});
