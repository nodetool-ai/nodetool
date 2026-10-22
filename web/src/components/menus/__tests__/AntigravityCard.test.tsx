import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import "@testing-library/jest-dom";
import mockTheme from "../../../__mocks__/themeMock";
import AntigravityCard from "../AntigravityCard";

const mockStatus = jest.fn();
const mockInstall = jest.fn();
jest.mock("../../../lib/trpc", () => ({
  trpc: {
    antigravity: {
      status: { query: () => mockStatus() },
      install: { mutate: () => mockInstall() }
    }
  }
}));
jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: ({
    children,
    onRetry
  }: {
    children: React.ReactNode;
    onRetry: () => void;
  }) => (
    <div role="alert">
      {children}
      <button onClick={onRetry}>Try again</button>
    </div>
  )
}));
const missing = {
  available: true,
  installed: false,
  installing: false,
  command: null,
  reason: null
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <AntigravityCard />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { invalidate };
}
beforeEach(() => {
  jest.resetAllMocks();
  mockStatus.mockResolvedValue(missing);
  mockInstall.mockResolvedValue({ installed: true });
});
it("installs with one click then shows the sign-in command and refresh action", async () => {
  const { invalidate } = setup();
  const button = await screen.findByRole("button", {
    name: "Install Antigravity"
  });
  await waitFor(() => expect(button).toBeEnabled());
  mockStatus.mockResolvedValue({
    ...missing,
    installed: true,
    command: "'/nodetool/bin/agy'"
  });
  await userEvent.click(button);
  expect(mockInstall).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("'/nodetool/bin/agy'")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Refresh models" }));
  expect(invalidate).toHaveBeenCalledWith(
    expect.objectContaining({ predicate: expect.any(Function) })
  );
});
it("disables the action while downloading", async () => {
  mockInstall.mockImplementation(() => new Promise(() => undefined));
  setup();
  const button = await screen.findByRole("button", {
    name: "Install Antigravity"
  });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(
    await screen.findByRole("button", { name: "Installing Antigravity…" })
  ).toBeDisabled();
});
it("displays install failures and allows retry", async () => {
  mockInstall.mockRejectedValueOnce(new Error("Download failed. Try again."));
  setup();
  const button = await screen.findByRole("button", {
    name: "Install Antigravity"
  });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Download failed");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockInstall).toHaveBeenCalledTimes(2));
});
it("explains when installation is unavailable", async () => {
  mockStatus.mockResolvedValue({
    ...missing,
    available: false,
    reason: "Local installation only"
  });
  setup();
  expect(
    await screen.findByText("Local installation only")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Install Antigravity" })
  ).toBeDisabled();
});
