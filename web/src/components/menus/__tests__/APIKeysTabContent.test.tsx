import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
// The custom-provider section lists the user's endpoints over tRPC; this suite
// has no server, and an empty catalog is the state it renders here.
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    customProviders: {
      list: { query: jest.fn().mockResolvedValue([]) },
      save: { mutate: jest.fn() },
      delete: { mutate: jest.fn() },
      test: { mutate: jest.fn() }
    }
  }
}));
jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: <T,>(
    selector: (state: {
      secrets: unknown[];
      updateSecret: jest.Mock;
      deleteSecret: jest.Mock;
    }) => T
  ) =>
    selector({
      secrets: [],
      updateSecret: jest.fn(),
      deleteSecret: jest.fn()
    })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <APIKeysTabContent />
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(
      screen.queryByRole("button", { name: /sign in with claude/i })
    ).not.toBeInTheDocument();
    // The API-key providers are unaffected.
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });
});
