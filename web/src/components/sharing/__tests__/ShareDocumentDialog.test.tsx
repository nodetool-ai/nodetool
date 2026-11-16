/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn().mockResolvedValue(undefined),
  isPending: false
});

const mockSharing = {
  query: { data: undefined as unknown, isLoading: false },
  createLink: mutation(),
  revokeLink: mutation(),
  setRole: mutation(),
  removeCollaborator: mutation(),
  invite: mutation(),
  setLinkOptions: mutation(),
  setInvitationOptions: mutation(),
  dismissNotice: mutation()
};

jest.mock("../../../serverState/useDocumentSharing", () => ({
  useDocumentSharing: () => mockSharing,
  documentShareUrlForToken: (token: string) => `https://host/share/document/${token}`
}));
jest.mock("../../../serverState/useWorkflowSharing", () => ({
  useWorkflowSharing: () => mockSharing,
  shareUrlForToken: (token: string) => `https://host/share/${token}`
}));
jest.mock("../../../serverState/usePeopleSearch", () => ({
  canSearchPeople: () => false,
  PEOPLE_SEARCH_MIN_LENGTH: 2,
  usePeopleSearch: () => ({ data: undefined, isFetching: false })
}));
const mockAddNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: jest.Mock }) => unknown
  ) => selector({ addNotification: mockAddNotification })
}));

import ShareDocumentDialog from "../ShareDocumentDialog";

const off = { allow_history: false, allow_download: false, allow_duplicate: false };

const viewLink = {
  id: "share-1",
  document_type: "timeline",
  document_id: "t1",
  token: "tok",
  role: "viewer",
  created_by: "owner",
  disabled_at: null,
  revoked_at: null,
  options: { ...off, allow_download: true },
  owner_notice: null as string | null
};

const grace = {
  user_id: "u2",
  display_name: "Grace Hopper",
  email: "grace@example.com",
  access: {
    role: "viewer",
    options: { ...off, allow_download: true, allow_history: true },
    grants: [
      {
        source: "link",
        grant_id: "g1",
        share_id: "share-1",
        role: "viewer",
        options: { ...off, allow_download: true },
        link_disabled: false
      },
      {
        source: "invitation",
        grant_id: "g2",
        share_id: null,
        role: "viewer",
        options: { ...off, allow_history: true },
        link_disabled: false
      }
    ],
    given_by: {
      role: [0, 1],
      allow_history: [1],
      allow_download: [0],
      allow_duplicate: []
    }
  }
};

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShareDocumentDialog
        open
        onClose={jest.fn()}
        target={{ type: "timeline", id: "t1", name: "Cut" }}
      />
    </ThemeProvider>
  );

describe("ShareDocumentDialog options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSharing.query = {
      data: {
        shares: [viewLink],
        collaborators: [
          { user_id: "u2", role: "viewer", share_id: "share-1" },
          { user_id: "u2", role: "viewer", share_id: null }
        ],
        people: [grace]
      },
      isLoading: false
    };
  });

  it("lists a person once with the grants that give their access", () => {
    renderDialog();
    expect(screen.getAllByText("Grace Hopper")).toHaveLength(1);
    expect(
      screen.getByText("Access from view link and invitation")
    ).toBeInTheDocument();
  });

  it("changes a view link's option and says what turning one off keeps", async () => {
    const user = userEvent.setup();
    renderDialog();

    const download = document.getElementById(
      "share-share-1-allow_download"
    ) as HTMLInputElement;
    expect(download).toBeChecked();
    await user.click(download);

    expect(mockSharing.setLinkOptions.mutateAsync).toHaveBeenCalledWith({
      shareId: "share-1",
      options: { allow_download: false }
    });
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        content: "People keep anything they already downloaded or duplicated."
      })
    );
  });

  it("changes the options of an invitation", async () => {
    const user = userEvent.setup();
    renderDialog();

    const duplicate = document.getElementById(
      "invitation-u2-allow_duplicate"
    ) as HTMLInputElement;
    await user.click(duplicate);

    expect(mockSharing.setInvitationOptions.mutateAsync).toHaveBeenCalledWith({
      userId: "u2",
      options: { allow_duplicate: true }
    });
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it("shows the history notice and turns history back on", async () => {
    const user = userEvent.setup();
    mockSharing.query = {
      data: {
        shares: [{ ...viewLink, owner_notice: "history_off" }],
        collaborators: [],
        people: []
      },
      isLoading: false
    };
    renderDialog();

    const notice = screen
      .getByText(
        "Viewers of this link no longer see saved versions. Turn history on to give them back."
      )
      .closest("[role=alert]") as HTMLElement;
    await user.click(within(notice).getByRole("button", { name: "Turn on history" }));

    expect(mockSharing.setLinkOptions.mutateAsync).toHaveBeenCalledWith({
      shareId: "share-1",
      options: { allow_history: true }
    });
    expect(mockSharing.dismissNotice.mutate).toHaveBeenCalledWith("share-1");
  });
});
