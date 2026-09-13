/**
 * Creating a chat or image from `+ New` must stamp the selected project on
 * the tab. Without it the tab bar hides the new document and the click looks
 * like a no-op.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  mockCreationProjectId,
  mockOpenMenu,
  renderOpenMenu
} from "../openMenuTestHarness";

const stubCanvas = () => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({ fillRect: jest.fn(), fillStyle: "" })
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: (done: (blob: Blob | null) => void) => {
      done(new Blob(["png"], { type: "image/png" }));
    }
  });
};

describe("OpenMenu create into the selected project", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreationProjectId.value = "p1";
    mockOpenMenu.createNewThread.mockResolvedValue("thread-1");
    mockOpenMenu.createAsset.mockResolvedValue({
      id: "img-1",
      name: "Untitled.png"
    });
    stubCanvas();
  });

  afterEach(() => {
    mockCreationProjectId.value = "default";
  });

  it("opens a new chat in the selected project", async () => {
    const user = userEvent.setup();
    renderOpenMenu();
    await user.click(screen.getByText("New chat"));

    await waitFor(() =>
      expect(mockOpenMenu.openTab).toHaveBeenCalledWith({
        type: "chat",
        ref: "thread-1",
        mode: "view",
        title: "New chat",
        projectId: "p1"
      })
    );
  });

  it("opens a new image in the selected project", async () => {
    const user = userEvent.setup();
    renderOpenMenu();
    await user.click(screen.getByText("New image"));

    await waitFor(() =>
      expect(mockOpenMenu.createAsset).toHaveBeenCalledWith(
        expect.any(File),
        undefined,
        undefined,
        undefined,
        undefined,
        "p1"
      )
    );
    expect(mockOpenMenu.openTab).toHaveBeenCalledWith({
      type: "image",
      ref: "img-1",
      mode: "edit",
      title: "Untitled.png",
      projectId: "p1"
    });
  });
});
