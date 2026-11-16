import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

const listQuery = jest.fn();
const endMutate = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    agentAccess: {
      listDeviceSessions: { query: (...args: unknown[]) => listQuery(...args) },
      endDeviceSession: { mutate: (...args: unknown[]) => endMutate(...args) }
    }
  }
}));

import DeviceSessionsSettings from "../DeviceSessionsSettings";

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DeviceSessionsSettings />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const SESSION = {
  id: "a".repeat(32),
  app_name: "timeline",
  device_name: "Studio Mac",
  created_at: "2026-11-01T10:00:00.000Z",
  last_used_at: null
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("DeviceSessionsSettings", () => {
  it("renders nothing on a server without desktop sign-in", async () => {
    listQuery.mockResolvedValue({ available: false, sessions: [] });
    const { container } = renderCard();

    await waitFor(() => expect(listQuery).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says no computer is signed in when the list is empty", async () => {
    listQuery.mockResolvedValue({ available: true, sessions: [] });
    renderCard();

    expect(await screen.findByText("No computer is signed in.")).toBeInTheDocument();
  });

  it("lists a session and ends it after confirmation", async () => {
    listQuery.mockResolvedValue({ available: true, sessions: [SESSION] });
    endMutate.mockResolvedValue({ ok: true });
    renderCard();

    expect(await screen.findByText("Studio Mac")).toBeInTheDocument();
    expect(screen.getByText(/Signed in from Timeline/)).toBeInTheDocument();
    expect(screen.getByText("Not used since sign-in")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(endMutate).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Studio Mac are signed out within a minute/)
    ).toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "End session" });
    await userEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(endMutate).toHaveBeenCalledWith({ session_id: SESSION.id })
    );
  });
});
