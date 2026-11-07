/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { AdminUser } from "../../../serverState/useAdminUsers";

const mockUseAdminUsers = jest.fn();
const mockMutate = jest.fn();
const mockSetUserQuota = jest.fn();
const mockSetDefaultQuota = jest.fn();
const mockDefaultQuota = {
  data: {
    period: "month",
    token_limit: 1000000,
    media_usd_limit: 20,
    configured: true
  }
};

const idleMutation = (mutate: jest.Mock) => ({
  mutate,
  reset: jest.fn(),
  isPending: false,
  isError: false,
  error: null
});

jest.mock("../../../serverState/useAdminUsers", () => ({
  useAdminUsers: (filter: unknown) => mockUseAdminUsers(filter),
  useUpdateAdminUser: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    variables: undefined,
    error: null
  }),
  useAdminDefaultQuota: () => mockDefaultQuota,
  useSetDefaultQuota: () => idleMutation(mockSetDefaultQuota),
  useSetUserQuota: () => idleMutation(mockSetUserQuota)
}));

import UsersAdmin from "../UsersAdmin";

const account = (overrides: Partial<AdminUser>): AdminUser => ({
  user_id: "u1",
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  auth_source: "oidc",
  groups: ["staff"],
  role: "member",
  is_admin: false,
  status: "active",
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-01T10:00:00.000Z",
  last_sign_in_at: "2026-11-01T10:00:00.000Z",
  last_seen_at: "2026-11-01T10:00:00.000Z",
  quota: {
    period: "month",
    token_limit: 1000000,
    media_usd_limit: 20,
    custom: false,
    since: "2026-11-01T00:00:00.000Z",
    tokens_used: 4200,
    media_usd_used: 1.5
  },
  ...overrides
});

const loaded = (users: AdminUser[], total = users.length) => ({
  data: { users, total },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn()
});

const renderUsers = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <UsersAdmin />
    </ThemeProvider>
  );

const rowFor = (name: string): HTMLElement => {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No row for ${name}`);
  return row;
};

describe("UsersAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("explains an empty directory", () => {
    mockUseAdminUsers.mockReturnValue(loaded([]));
    renderUsers();
    expect(screen.getByText("No users yet")).toBeInTheDocument();
  });

  it("lists people with their groups, role and status", () => {
    mockUseAdminUsers.mockReturnValue(
      loaded([
        account({}),
        account({
          user_id: "u2",
          display_name: "Grace Hopper",
          email: "grace@example.com",
          is_admin: true,
          groups: ["nodetool-admins"]
        })
      ])
    );
    renderUsers();
    const ada = rowFor("Ada Lovelace");
    expect(within(ada).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(ada).getByText("staff")).toBeInTheDocument();
    expect(within(ada).getByText("Member")).toBeInTheDocument();
    const grace = rowFor("Grace Hopper");
    expect(within(grace).getByText("Admin")).toBeInTheDocument();
    expect(
      within(grace).getByText("Through a group or server setting")
    ).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("promotes a member in one click", async () => {
    mockUseAdminUsers.mockReturnValue(loaded([account({})]));
    const user = userEvent.setup();
    renderUsers();
    await user.click(screen.getByRole("button", { name: "Make admin" }));
    expect(mockMutate).toHaveBeenCalledWith({ userId: "u1", role: "admin" });
  });

  it("asks before disabling, then disables", async () => {
    mockUseAdminUsers.mockReturnValue(loaded([account({})]));
    const user = userEvent.setup();
    renderUsers();
    await user.click(
      within(rowFor("Ada Lovelace")).getByRole("button", { name: "Disable" })
    );
    expect(mockMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Disable Ada Lovelace?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Disable" }));
    expect(mockMutate).toHaveBeenCalledWith({ userId: "u1", status: "disabled" });
  });

  it("re-enables a disabled account without asking", async () => {
    mockUseAdminUsers.mockReturnValue(
      loaded([account({ status: "disabled" })])
    );
    const user = userEvent.setup();
    renderUsers();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(mockMutate).toHaveBeenCalledWith({ userId: "u1", status: "active" });
  });

  it("pages through a long directory", async () => {
    const page = Array.from({ length: 50 }, (_, i) =>
      account({ user_id: `u${i}`, display_name: `Person ${i}`, email: null })
    );
    mockUseAdminUsers.mockReturnValue(loaded(page, 120));
    const user = userEvent.setup();
    renderUsers();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(mockUseAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 50, limit: 50 })
    );
  });

  it("shows each person's usage against their limits", () => {
    mockUseAdminUsers.mockReturnValue(
      loaded([
        account({}),
        account({
          user_id: "u2",
          display_name: "Grace Hopper",
          quota: {
            period: "day",
            token_limit: null,
            media_usd_limit: 5,
            custom: true,
            since: "2026-11-07T00:00:00.000Z",
            tokens_used: 10,
            media_usd_used: 0
          }
        })
      ])
    );
    renderUsers();
    expect(
      screen.getByText(
        "Default for everyone: 1,000,000 model tokens and $20.00 for media per month."
      )
    ).toBeInTheDocument();
    const ada = rowFor("Ada Lovelace");
    expect(within(ada).getByText("Tokens: 4,200 of 1,000,000")).toBeInTheDocument();
    expect(within(ada).getByText("Media: $1.50 of $20.00")).toBeInTheDocument();
    const grace = rowFor("Grace Hopper");
    expect(within(grace).getByText("Tokens: 10, no limit")).toBeInTheDocument();
    expect(within(grace).getByText("Own limits")).toBeInTheDocument();
  });

  it("gives one person limits of their own", async () => {
    mockUseAdminUsers.mockReturnValue(loaded([account({})]));
    const user = userEvent.setup();
    renderUsers();
    await user.click(
      within(rowFor("Ada Lovelace")).getByRole("button", { name: "Limits" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Limits for Ada Lovelace")).toBeInTheDocument();
    const tokens = within(dialog).getByLabelText("Model tokens");
    expect(tokens).toBeDisabled();
    await user.click(within(dialog).getByRole("switch", { name: /Use the server default/ }));
    expect(tokens).toBeEnabled();
    await user.clear(tokens);
    await user.type(tokens, "50,000");
    await user.clear(within(dialog).getByLabelText("Media budget (USD)"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(mockSetUserQuota).toHaveBeenCalledWith(
      {
        userId: "u1",
        limits: { period: "month", token_limit: 50000, media_usd_limit: null }
      },
      expect.anything()
    );
  });

  it("puts a person with own limits back on the default", async () => {
    mockUseAdminUsers.mockReturnValue(
      loaded([
        account({
          quota: {
            period: "day",
            token_limit: 10,
            media_usd_limit: null,
            custom: true,
            since: "2026-11-07T00:00:00.000Z",
            tokens_used: 0,
            media_usd_used: 0
          }
        })
      ])
    );
    const user = userEvent.setup();
    renderUsers();
    await user.click(screen.getByRole("button", { name: "Limits" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("switch", { name: /Use the server default/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(mockSetUserQuota).toHaveBeenCalledWith(
      { userId: "u1", limits: null },
      expect.anything()
    );
  });

  it("refuses a limit that is not a number", async () => {
    mockUseAdminUsers.mockReturnValue(loaded([account({})]));
    const user = userEvent.setup();
    renderUsers();
    await user.click(screen.getByRole("button", { name: "Edit default limits" }));
    const dialog = await screen.findByRole("dialog");
    const media = within(dialog).getByLabelText("Media budget (USD)");
    await user.clear(media);
    await user.type(media, "lots");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(media);
    await user.type(media, "12.5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(mockSetDefaultQuota).toHaveBeenCalledWith(
      { period: "month", token_limit: 1000000, media_usd_limit: 12.5 },
      expect.anything()
    );
  });
});
