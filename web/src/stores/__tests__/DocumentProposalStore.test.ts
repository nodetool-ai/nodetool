import {
  DOCUMENT_DIRECT_APPLY_STORAGE_KEY,
  useDocumentProposalStore,
  type DocumentProposal
} from "../DocumentProposalStore";

const makeProposal = (
  overrides: Partial<DocumentProposal> = {}
): DocumentProposal => ({
  proposalId: "prop-1",
  assetId: "asset-1",
  threadId: "thread-1",
  turnId: "turn-1",
  baseContent: "Original text",
  proposedContent: "Proposed text",
  draftContent: "Proposed text",
  receivedAt: 1700000000000,
  ...overrides
});

describe("DocumentProposalStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useDocumentProposalStore.setState({
      directApply: false,
      proposals: {},
      queuedProposals: {}
    });
  });

  it("defaults directApply to false and persists changes to localStorage", () => {
    expect(useDocumentProposalStore.getState().directApply).toBe(false);

    useDocumentProposalStore.getState().setDirectApply(true);
    expect(useDocumentProposalStore.getState().directApply).toBe(true);
    expect(
      window.localStorage.getItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY)
    ).toBe("true");

    useDocumentProposalStore.getState().setDirectApply(false);
    expect(useDocumentProposalStore.getState().directApply).toBe(false);
    expect(
      window.localStorage.getItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY)
    ).toBe("false");
  });

  it("hydrates directApply from localStorage on module initialization", () => {
    window.localStorage.setItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY, "true");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useDocumentProposalStore: isolated } = require("../DocumentProposalStore");
      expect(isolated.getState().directApply).toBe(true);
    });
  });

  it("sets, updates draft, and clears proposals per assetId", () => {
    const first = makeProposal({ assetId: "asset-1" });
    const second = makeProposal({
      proposalId: "prop-2",
      assetId: "asset-2",
      draftContent: "Second draft"
    });

    const store = useDocumentProposalStore.getState();
    store.setProposal(first);
    store.setProposal(second);

    expect(useDocumentProposalStore.getState().proposals["asset-1"]).toEqual(first);
    expect(useDocumentProposalStore.getState().proposals["asset-2"]).toEqual(second);

    useDocumentProposalStore.getState().updateDraft("asset-1", "User edited draft");
    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]?.draftContent
    ).toBe("User edited draft");
    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]?.proposedContent
    ).toBe("Proposed text");

    // Updating a missing asset is a no-op.
    useDocumentProposalStore.getState().updateDraft("missing", "ignored");
    expect(
      useDocumentProposalStore.getState().proposals["missing"]
    ).toBeUndefined();

    useDocumentProposalStore.getState().clearProposal("asset-1");
    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]
    ).toBeUndefined();
    expect(useDocumentProposalStore.getState().proposals["asset-2"]).toEqual(second);
  });

  it("queues a newer proposal instead of overwriting an edited draft and supports accept/dismiss/clear", () => {
    const initial = makeProposal({
      proposalId: "prop-1",
      assetId: "asset-1",
      proposedContent: "Agent v1",
      draftContent: "Agent v1"
    });
    const replacementUnedited = makeProposal({
      proposalId: "prop-2",
      assetId: "asset-1",
      proposedContent: "Agent v2",
      draftContent: "Agent v2"
    });
    const incomingWhileEdited = makeProposal({
      proposalId: "prop-3",
      assetId: "asset-1",
      proposedContent: "Agent v3",
      draftContent: "Agent v3"
    });
    const newerIncomingWhileEdited = makeProposal({
      proposalId: "prop-4",
      assetId: "asset-1",
      proposedContent: "Agent v4",
      draftContent: "Agent v4"
    });

    const store = useDocumentProposalStore.getState();
    store.setProposal(initial);

    // Unedited proposal is replaced directly without queueing.
    store.setProposal(replacementUnedited);
    expect(useDocumentProposalStore.getState().proposals["asset-1"]).toEqual(
      replacementUnedited
    );
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toBeUndefined();

    // Once the user edits the draft, a new proposal is queued instead of overwriting it.
    store.updateDraft("asset-1", "User customized draft");
    store.setProposal(incomingWhileEdited);

    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]?.draftContent
    ).toBe("User customized draft");
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toEqual(incomingWhileEdited);

    // Dismissing the queued proposal keeps the user's edited draft.
    store.dismissQueuedProposal("asset-1");
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toBeUndefined();
    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]?.draftContent
    ).toBe("User customized draft");

    // Queue another proposal and accept it to replace the active proposal.
    store.setProposal(newerIncomingWhileEdited);
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toEqual(newerIncomingWhileEdited);

    store.acceptQueuedProposal("asset-1");
    expect(useDocumentProposalStore.getState().proposals["asset-1"]).toEqual(
      newerIncomingWhileEdited
    );
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toBeUndefined();

    // Clearing removes both active and queued proposals for that asset.
    store.updateDraft("asset-1", "Edited again");
    store.setProposal(incomingWhileEdited);
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toEqual(incomingWhileEdited);

    store.clearProposal("asset-1");
    expect(
      useDocumentProposalStore.getState().proposals["asset-1"]
    ).toBeUndefined();
    expect(
      useDocumentProposalStore.getState().queuedProposals["asset-1"]
    ).toBeUndefined();
  });
});
