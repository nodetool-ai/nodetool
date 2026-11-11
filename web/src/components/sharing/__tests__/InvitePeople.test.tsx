/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockSearch = jest.fn();

jest.mock("../../../serverState/usePeopleSearch", () => ({
  PEOPLE_SEARCH_MIN_LENGTH: 2,
  usePeopleSearch: (query: string) => mockSearch(query)
}));

import InvitePeople from "../InvitePeople";

const grace = { user_id: "u2", display_name: "Grace Hopper", email: "grace@example.com" };

const renderInvite = (onInvite: jest.Mock) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <InvitePeople inviting={false} onInvite={onInvite} />
    </ThemeProvider>
  );

describe("InvitePeople", () => {
  beforeEach(() => {
    mockSearch.mockImplementation((query: string) => ({
      data: query.trim().length >= 2 ? { people: [grace] } : undefined,
      isFetching: false
    }));
  });

  it("finds a person by name and invites them with the chosen role", async () => {
    const onInvite = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderInvite(onInvite);

    const invite = screen.getByRole("button", { name: "Invite" });
    expect(invite).toBeDisabled();
    await user.type(screen.getByRole("combobox", { name: "Invite people" }), "gra");
    expect(mockSearch).toHaveBeenLastCalledWith("gra");
    await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));
    expect(invite).toBeEnabled();

    await user.click(invite);
    expect(onInvite).toHaveBeenCalledWith("u2", "viewer");
    expect(screen.getByRole("combobox", { name: "Invite people" })).toHaveValue("");
  });

  it("asks for more characters before searching", async () => {
    const user = userEvent.setup();
    renderInvite(jest.fn());
    await user.type(screen.getByRole("combobox", { name: "Invite people" }), "g");
    expect(await screen.findByText("Type at least 2 characters")).toBeInTheDocument();
  });
});
