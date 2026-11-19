/**
 * @jest-environment node
 */
const mockList = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: { cloudLocal: { drafts: { list: { query: (input: unknown) => mockList(input) } } } }
}));

import { countCloudDrafts } from "../waitingDrafts";
import { serverKeyOf } from "../localDraftStore";
import type { CloudAccountState } from "../../../window";

const account: CloudAccountState = {
  available: true,
  state: "signedIn",
  displayName: "Ada",
  accountId: "u1",
  serverOrigin: "https://api.nodetool.ai",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: ""
};

describe("countCloudDrafts", () => {
  beforeEach(() => mockList.mockReset());

  it("counts the account's waiting and refused drafts on this server", async () => {
    mockList.mockResolvedValue({ drafts: [{ state: "waiting" }, { state: "unsent" }, { state: "waiting" }] });
    await expect(countCloudDrafts(account)).resolves.toEqual({ waiting: 2, unsent: 1 });
    expect(mockList).toHaveBeenCalledWith({
      server_key: await serverKeyOf("https://api.nodetool.ai"),
      account_id: "u1"
    });
  });

  it("answers null when the local server does not answer", async () => {
    mockList.mockRejectedValue(new Error("offline"));
    await expect(countCloudDrafts(account)).resolves.toBeNull();
  });

  it("counts nothing without an account", async () => {
    await expect(countCloudDrafts({ ...account, accountId: "" })).resolves.toEqual({ waiting: 0, unsent: 0 });
    expect(mockList).not.toHaveBeenCalled();
  });
});
