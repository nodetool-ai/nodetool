import { createDraftOf, useCreateViewStore } from "../../../stores/CreateViewStore";
import { tabId, useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import {
  createSeedFromMedia,
  nameSessionAfterPrompt,
  openCreateSession,
  referencesFromAttachments,
  titleFromPrompt
} from "../openCreateSession";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    threads: {
      create: { mutate: (input: unknown) => mockCreate(input) },
      update: { mutate: (input: unknown) => mockUpdate(input) }
    }
  }
}));
jest.mock("../../../queryClient", () => ({
  queryClient: { invalidateQueries: jest.fn() }
}));

const draft = (id: string) => createDraftOf(useCreateViewStore.getState(), id);

describe("openCreateSession", () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: "thread-1" });
    mockUpdate.mockReset().mockResolvedValue({});
    useCreateViewStore.setState({ drafts: {} });
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("records a Create thread in the project and opens its tab in the mode asked for", async () => {
    const id = await openCreateSession("project-1", { mode: "video" });
    expect(id).toBe("thread-1");
    expect(mockCreate).toHaveBeenCalledWith({
      title: "New video",
      project_id: "project-1",
      kind: "create"
    });
    expect(draft("thread-1")).toMatchObject({ mode: "video", prompt: "", titled: false });
    const tab = useWorkspaceTabsStore.getState().tabs.find((item) => item.id === tabId("create", "thread-1"));
    expect(tab).toMatchObject({ type: "create", ref: "thread-1", projectId: "project-1", title: "New video" });
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(tabId("create", "thread-1"));
  });

  it("carries the prompt and library attachments, and keeps a caller's title", async () => {
    await openCreateSession("project-1", {
      mode: "image_edit",
      title: "Harbour at night",
      prompt: "make it night",
      references: referencesFromAttachments([
        { id: "1", dataUri: "", type: "image/png", name: "harbour", assetUri: "asset://pic" },
        { id: "2", dataUri: "data:image/png;base64,AA", type: "image/png", name: "unsaved" }
      ])
    });
    expect(draft("thread-1")).toMatchObject({
      mode: "image_edit",
      prompt: "make it night",
      titled: true,
      references: [{ assetId: "pic", contentType: "image/png", name: "harbour" }]
    });
  });

  it("names an unnamed session after its first prompt, once", async () => {
    await openCreateSession("project-1", { mode: "image" });
    await nameSessionAfterPrompt("thread-1", "a lighthouse at dusk\nlong exposure");
    expect(mockUpdate).toHaveBeenCalledWith({ id: "thread-1", title: "a lighthouse at dusk" });
    expect(useWorkspaceTabsStore.getState().tabs[0]?.title).toBe("a lighthouse at dusk");
    await nameSessionAfterPrompt("thread-1", "another prompt");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("cuts a long prompt to a tab's width", () => {
    const title = titleFromPrompt("x".repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("createSeedFromMedia", () => {
  const image = (assetId?: string) =>
    ({ type: "image_url", image: { type: "image", uri: "", asset_id: assetId } }) as const;
  const video = (assetId: string) =>
    ({ type: "video", video: { type: "video", uri: "", asset_id: assetId } }) as const;

  it("carries a reply's stored pictures as sources to edit", () => {
    expect(createSeedFromMedia("a harbour", [image("a"), image(), image("b")], "image")).toEqual({
      mode: "image_edit",
      prompt: "a harbour",
      references: [
        { assetId: "a", contentType: "image/png", name: "Generated image" },
        { assetId: "b", contentType: "image/png", name: "Generated image" }
      ]
    });
  });

  it("carries a reply's first clip to retake", () => {
    expect(createSeedFromMedia("waves", [video("v1"), video("v2")], "video")).toMatchObject({
      mode: "retake",
      references: [{ assetId: "v1", contentType: "video/mp4" }]
    });
  });

  it("carries only the prompt for audio, in the mode it was made in", () => {
    const audio = [{ type: "audio", audio: { type: "audio", uri: "", asset_id: "s" } }] as const;
    expect(createSeedFromMedia("a song", audio, "music")).toEqual({ mode: "music", prompt: "a song" });
    expect(createSeedFromMedia("hello", audio)).toEqual({ mode: "audio", prompt: "hello" });
  });
});
