import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

import { useOAuthConnection } from "../../../hooks/useOAuthConnection";

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
const mockCreditsQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    settings: {
      providerCredits: { query: (...args: unknown[]) => mockCreditsQuery(...args) }
    }
  }
}));
jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { validateSecret: jest.Mock }) => T) =>
    selector({ validateSecret: jest.fn() }),
  accountWarning: () => null
}));

import { ProviderCard } from "../APIKeysTab";
import { getProviderMeta } from "../providerCatalog";

function renderCard(key: string) {
  const meta = getProviderMeta(key);
  if (!meta) throw new Error(`no provider meta for ${key}`);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <ProviderCard
          secret={{ key, is_configured: true } as never}
          meta={meta}
          onConnect={jest.fn()}
          onManage={jest.fn()}
          onDelete={jest.fn()}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("ProviderCard credit line", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useOAuthConnection as jest.MockedFunction<typeof useOAuthConnection>)
      .mockReturnValue({
        label: "",
        isConnected: false,
        isConnecting: false,
        canDisconnect: false,
        connect: jest.fn(),
        disconnect: jest.fn(),
        manualPrompt: null,
        callbackUrl: null,
        isSubmittingManual: false,
        submitManualCode: jest.fn(),
        cancelManual: jest.fn()
      });
  });

  it("shows the remaining balance a provider reports", async () => {
    mockCreditsQuery.mockResolvedValue([
      {
        provider: "openrouter",
        supported: true,
        credit: {
          state: "available",
          remaining: 12.5,
          limit: 20,
          unit: "currency",
          currency: "USD",
          source: "balance_endpoint",
          summary: "",
          checkedAt: 0
        }
      }
    ]);
    renderCard("OPENROUTER_API_KEY");
    expect(await screen.findByText("Credit left: $12.50 of $20.00")).toBeInTheDocument();
  });

  it("says a provider refused a call for lack of credit", async () => {
    mockCreditsQuery.mockResolvedValue([
      {
        provider: "openrouter",
        supported: true,
        credit: {
          state: "exhausted",
          source: "call_failure",
          summary: "",
          checkedAt: 0
        }
      }
    ]);
    renderCard("OPENROUTER_API_KEY");
    expect(
      await screen.findByText(/refused a call for lack of credit/)
    ).toBeInTheDocument();
  });

  it("shows nothing when the credit is unknown", async () => {
    mockCreditsQuery.mockResolvedValue([
      { provider: "openrouter", supported: true, credit: null }
    ]);
    renderCard("OPENROUTER_API_KEY");
    await screen.findByText("OpenRouter");
    expect(screen.queryByText(/Credit left/)).not.toBeInTheDocument();
  });
});
