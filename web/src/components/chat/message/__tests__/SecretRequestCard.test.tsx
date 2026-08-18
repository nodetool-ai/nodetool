import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import SecretRequestCard from "../SecretRequestCard";
import mockTheme from "../../../../__mocks__/themeMock";
import type { PendingSecretRequest } from "../../../../stores/GlobalChatStore";

const updateSecret = jest.fn<Promise<void>, [string, string, string?]>();

jest.mock("../../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ updateSecret })
}));

const request: PendingSecretRequest = {
  thread_id: "t1",
  key: "STRIPE_API_KEY",
  description: "Stripe API key for payments.",
  reason: "to look up the invoice",
  help_url: "https://dashboard.stripe.com/apikeys"
};

const onResolve = jest.fn();

const renderCard = (overrides: Partial<PendingSecretRequest> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SecretRequestCard
        approvalId="secret_1"
        request={{ ...request, ...overrides }}
        onResolve={onResolve}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  updateSecret.mockReset();
  updateSecret.mockResolvedValue(undefined);
  onResolve.mockReset();
});

describe("SecretRequestCard", () => {
  it("shows the key, the agent's reason, and where to get it", () => {
    renderCard();
    // Once in the header, once as the input's label.
    expect(screen.getAllByText("STRIPE_API_KEY").length).toBeGreaterThan(0);
    expect(screen.getByText("to look up the invoice")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /where to get this key/i })
    ).toHaveAttribute("href", "https://dashboard.stripe.com/apikeys");
  });

  it("renders a non-https help url as no link at all", () => {
    renderCard({ help_url: "javascript:alert(1)" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("saves the value itself and answers with only the outcome", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText("STRIPE_API_KEY"), "sk_live_secret");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "STRIPE_API_KEY",
        "sk_live_secret"
      )
    );
    // The value reaches the secret store and nothing else: the frame this
    // sends back carries an outcome and no credential.
    expect(onResolve).toHaveBeenCalledWith("secret_1", "saved");
    expect(JSON.stringify(onResolve.mock.calls)).not.toContain("sk_live_secret");
  });

  it("cannot be saved empty", async () => {
    renderCard();
    expect(screen.getByRole("button", { name: /save key/i })).toBeDisabled();
  });

  it("keeps the prompt open when the store rejects", async () => {
    const user = userEvent.setup();
    updateSecret.mockRejectedValue(new Error("storage is locked"));
    renderCard();

    await user.type(screen.getByLabelText("STRIPE_API_KEY"), "sk_live_secret");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    expect(await screen.findByText("storage is locked")).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("declines without touching the store", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: /not now/i }));
    expect(updateSecret).not.toHaveBeenCalled();
    expect(onResolve).toHaveBeenCalledWith("secret_1", "declined");
  });
});
