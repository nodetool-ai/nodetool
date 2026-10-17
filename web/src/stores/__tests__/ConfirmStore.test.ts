import { requestConfirm, useConfirmStore } from "../ConfirmStore";

beforeEach(() => useConfirmStore.setState({ pending: null }));

it("resolves with the user's answer and clears the request", async () => {
  const answer = requestConfirm({ title: "Discard?", confirmText: "Discard" });
  expect(useConfirmStore.getState().pending?.request.title).toBe("Discard?");
  useConfirmStore.getState().settle(true);
  await expect(answer).resolves.toBe(true);
  expect(useConfirmStore.getState().pending).toBeNull();
});

it("answers only once", async () => {
  const answer = requestConfirm({ title: "Discard?", confirmText: "Discard" });
  useConfirmStore.getState().settle(false);
  useConfirmStore.getState().settle(true);
  await expect(answer).resolves.toBe(false);
});

it("a newer request declines the unanswered one", async () => {
  const first = requestConfirm({ title: "First", confirmText: "OK" });
  const second = requestConfirm({ title: "Second", confirmText: "OK" });
  await expect(first).resolves.toBe(false);
  expect(useConfirmStore.getState().pending?.request.title).toBe("Second");
  useConfirmStore.getState().settle(true);
  await expect(second).resolves.toBe(true);
});
