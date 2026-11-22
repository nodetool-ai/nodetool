import { act, renderHook, waitFor } from "@testing-library/react";
import { $getRoot, $isElementNode, $createTextNode, createEditor, type LexicalEditor } from "lexical";

import { trpcClient } from "../../../trpc/client";
import { useAssetStore } from "../../../stores/AssetStore";
import { useConflictStore } from "../../../stores/ConflictStore";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import {
  DOCUMENT_NODES,
  MarkdownDocumentBinding
} from "../../../components/documentEditor/markdownBlockCodec";
import { useMarkdownDocumentSync } from "../useMarkdownDocumentSync";

jest.mock("../../../trpc/client", () => ({
  trpcClient: { assets: { update: { mutate: jest.fn() } } }
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: jest.fn() }
}));
jest.mock("../../../queryClient", () => ({
  queryClient: { setQueryData: jest.fn() }
}));

const updateMutate = trpcClient.assets.update.mutate as jest.Mock;

/** The file and row the fake server holds. */
const server = {
  text: "",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metadata: { keep: "me" } as Record<string, unknown>
};

const assetRow = () => ({
  id: "doc-1",
  name: "notes.md",
  content_type: "text/markdown",
  project_id: "p1",
  updated_at: server.updatedAt,
  metadata: server.metadata,
  get_url: "http://test/doc-1"
});

/** Write the file as an agent or another tab would, bumping the revision. */
const writeOutside = (text: string, at: string) => {
  server.text = text;
  server.updatedAt = at;
};

let nextId = 0;
const newEditor = () =>
  createEditor({
    namespace: "test",
    nodes: [...DOCUMENT_NODES],
    onError: (error) => {
      throw error;
    }
  });

const setText = (editor: LexicalEditor, index: number, text: string) => {
  act(() => editor.update(
    () => {
      const node = $getRoot().getChildren()[index];
      if ($isElementNode(node)) {
        node.clear();
        node.append($createTextNode(text));
      }
    },
    { discrete: true }
  ));
};

const mount = async (text: string) => {
  server.text = text;
  const editor = newEditor();
  const binding = new MarkdownDocumentBinding(() => `new-${++nextId}`);
  const rendered = renderHook(() => useMarkdownDocumentSync("doc-1", editor, binding));
  await waitFor(() => expect(rendered.result.current.loadState).toBe("ready"));
  return { editor, binding, rendered };
};

beforeEach(() => {
  jest.clearAllMocks();
  server.updatedAt = "2026-01-01T00:00:00.000Z";
  server.metadata = { keep: "me" };
  useConflictStore.setState({ byKey: {} });
  (useAssetStore.getState as jest.Mock).mockReturnValue({
    get: jest.fn(async () => assetRow()),
    add: jest.fn()
  });
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => server.text
  })) as unknown as typeof fetch;
  updateMutate.mockImplementation(
    async (input: { data: string; metadata: Record<string, unknown>; expected_updated_at?: string }) => {
      if (input.expected_updated_at !== server.updatedAt) {
        throw new Error("Asset was modified since last read (optimistic concurrency conflict)");
      }
      server.text = input.data;
      server.metadata = input.metadata;
      server.updatedAt = new Date(Date.parse(server.updatedAt) + 1000).toISOString();
      return assetRow();
    }
  );
});

describe("useMarkdownDocumentSync", () => {
  it("saves only the edited block, against the loaded revision", async () => {
    const source = "# Title\n\nFirst  paragraph with *odd*   spacing.\n\nSecond.\n";
    const { editor, rendered } = await mount(source);

    setText(editor, 2, "Second, edited.");
    await act(() => rendered.result.current.flush());

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const input = updateMutate.mock.calls[0][0];
    expect(input.expected_updated_at).toBe("2026-01-01T00:00:00.000Z");
    expect(input.data).toBe(
      "# Title\n\nFirst  paragraph with *odd*   spacing.\n\nSecond, edited.\n"
    );
    expect(input.metadata.keep).toBe("me");
    expect(input.metadata.document_blocks.blocks).toHaveLength(3);
    rendered.unmount();
  });

  it("does not write a document nobody edited", async () => {
    const { rendered } = await mount("Untouched *text*\n");
    await act(() => rendered.result.current.flush());
    rendered.unmount();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("keeps block ids across sessions through the asset metadata", async () => {
    const first = await mount("one\n\ntwo\n");
    setText(first.editor, 1, "TWO");
    await act(() => first.rendered.result.current.flush());
    const savedIds = (server.metadata.document_blocks as { blocks: { id: string }[] }).blocks.map(
      (block) => block.id
    );
    first.rendered.unmount();

    const second = await mount(server.text);
    const ids = second.binding
      .serialize(second.editor.getEditorState())
      .blocks.map((block) => block.id);
    expect(ids).toEqual(savedIds);
    second.rendered.unmount();
  });

  it("reloads an outside write into a clean editor, keeping unchanged ids", async () => {
    const { editor, binding, rendered } = await mount("alpha\n\nbeta\n");
    const before = binding.serialize(editor.getEditorState()).blocks.map((block) => block.id);

    writeOutside("alpha\n\nbeta changed\n\ngamma\n", "2026-01-02T00:00:00.000Z");
    act(() => {
      handleDocumentResourceChange("asset", {
        event: "updated",
        id: "doc-1",
        updatedAt: server.updatedAt
      });
    });
    await waitFor(() => expect(rendered.result.current.status).toBe("reloaded"));

    const after = binding.serialize(editor.getEditorState());
    expect(after.blocks.map((block) => block.text)).toEqual(["alpha", "beta changed", "gamma"]);
    expect(after.blocks[0].id).toBe(before[0]);
    expect(after.blocks[1].id).toBe(before[1]);
    rendered.unmount();
  });

  it("merges an outside write into a dirty draft and lists a refused block", async () => {
    const { editor, rendered } = await mount("alpha\n\nbeta\n\ngamma\n");
    setText(editor, 0, "alpha by me");
    setText(editor, 1, "beta by me");

    writeOutside("alpha\n\nbeta by agent\n\ngamma by agent\n", "2026-01-02T00:00:00.000Z");
    act(() => {
      handleDocumentResourceChange("asset", {
        event: "updated",
        id: "doc-1",
        updatedAt: server.updatedAt
      });
    });
    await waitFor(() =>
      expect(useConflictStore.getState().byKey["document:doc-1"]?.conflicts).toHaveLength(1)
    );

    await act(() => rendered.result.current.flush());
    const saved = updateMutate.mock.calls.at(-1)?.[0];
    // The draft wins the block both changed; the agent's other edit lands.
    expect(saved.data).toBe("alpha by me\n\nbeta by me\n\ngamma by agent\n");
    expect(saved.expected_updated_at).toBe("2026-01-02T00:00:00.000Z");
    rendered.unmount();
  });

  it("recovers from a stale revision by merging before it saves", async () => {
    const { editor, rendered } = await mount("alpha\n\nbeta\n");
    setText(editor, 0, "alpha by me");
    // The outside write lands without a notice reaching this tab.
    writeOutside("alpha\n\nbeta by agent\n", "2026-01-02T00:00:00.000Z");

    await act(() => rendered.result.current.flush());
    expect(server.text).toBe("alpha by me\n\nbeta by agent\n");
    rendered.unmount();
  });
});
