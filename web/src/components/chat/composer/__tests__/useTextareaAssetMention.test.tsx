import React, { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Asset } from "../../../../stores/ApiTypes";
import type { Entity } from "@nodetool-ai/protocol";
import {
  findMentionTrigger,
  useTextareaAssetMention
} from "../useTextareaAssetMention";
import type { AssetMentionMenuProps } from "../../../node_types/editing/promptComposer/AssetMentionMenu";

// Stub the search hook so the picker shows a fixed asset set (no trpc / stores).
const MOCK_ASSETS: Asset[] = [
  { id: "a1", name: "fox.png", content_type: "image/png" } as Asset,
  { id: "a2", name: "wave.wav", content_type: "audio/wav" } as Asset
];
const MOCK_ENTITIES = [
  {
    type: "entity",
    id: "e1",
    kind: "character",
    name: "Marta",
    descriptor: "red-haired detective"
  }
] as unknown as Entity[];
const setActiveTab = jest.fn();
jest.mock(
  "../../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    useAssetMentionSearch: () => ({
      activeTab: "saved",
      setActiveTab,
      entities: MOCK_ENTITIES,
      displayedAssets: MOCK_ASSETS,
      handleRename: jest.fn()
    })
  })
);

// Lightweight menu that surfaces the selected index and lets a test click a
// tile. Mirrors the real menu's combined order: entities first, then assets.
jest.mock(
  "../../../node_types/editing/promptComposer/AssetMentionMenu",
  () => ({
    AssetMentionMenu: ({
      entities = [],
      assets,
      selectedIndex,
      onSelect
    }: AssetMentionMenuProps) => (
      <div data-testid="asset-mention-menu">
        <span data-testid="selected-index">{selectedIndex}</span>
        {entities.map((entity, index) => (
          <button
            key={entity.id}
            type="button"
            data-testid={`entity-tile-${entity.id}`}
            onClick={() => onSelect(index)}
          >
            {entity.name}
          </button>
        ))}
        {assets.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            data-testid={`tile-${asset.id}`}
            onClick={() => onSelect(entities.length + index)}
          >
            {asset.name}
          </button>
        ))}
      </div>
    )
  })
);

describe("findMentionTrigger", () => {
  it("matches an @ at the start of the value", () => {
    expect(findMentionTrigger("@", 1)).toEqual({ start: 0, end: 1, query: "" });
    expect(findMentionTrigger("@fox", 4)).toEqual({
      start: 0,
      end: 4,
      query: "fox"
    });
  });

  it("matches an @ after whitespace or a newline", () => {
    expect(findMentionTrigger("hello @wo", 9)).toEqual({
      start: 6,
      end: 9,
      query: "wo"
    });
    expect(findMentionTrigger("line1\n@foo", 10)).toEqual({
      start: 6,
      end: 10,
      query: "foo"
    });
  });

  it("ignores an @ glued to a preceding word (e.g. email)", () => {
    expect(findMentionTrigger("user@host", 9)).toBeNull();
    expect(findMentionTrigger("a@b", 3)).toBeNull();
  });

  it("does not match once whitespace follows the @", () => {
    expect(findMentionTrigger("hello @wo world", 15)).toBeNull();
    expect(findMentionTrigger("@foo\nbar", 8)).toBeNull();
  });

  it("uses the last @ before the caret", () => {
    expect(findMentionTrigger("a @b @c", 7)).toEqual({
      start: 5,
      end: 7,
      query: "c"
    });
  });

  it("rejects an over-long query", () => {
    const long = "@" + "x".repeat(65);
    expect(findMentionTrigger(long, long.length)).toBeNull();
  });
});

const Harness: React.FC<{
  onSelectAsset: (asset: Asset) => void;
  onSelectEntity?: (entity: Entity) => void;
}> = ({ onSelectAsset, onSelectEntity }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const { mentionMenu, handleKeyDown } = useTextareaAssetMention({
    textareaRef: ref,
    value,
    setValue,
    onSelectAsset,
    onSelectEntity
  });
  return (
    <>
      <textarea
        ref={ref}
        aria-label="prompt"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {mentionMenu}
    </>
  );
};

describe("useTextareaAssetMention", () => {
  beforeEach(() => setActiveTab.mockClear());

  it("opens the picker when @ is typed at a word boundary", async () => {
    const user = userEvent.setup();
    render(<Harness onSelectAsset={jest.fn()} />);
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@");
    expect(await screen.findByTestId("asset-mention-menu")).toBeInTheDocument();
  });

  it("does not open when @ is glued to a preceding word", async () => {
    const user = userEvent.setup();
    render(<Harness onSelectAsset={jest.fn()} />);
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "hi@");
    expect(screen.queryByTestId("asset-mention-menu")).not.toBeInTheDocument();
  });

  it("navigates with arrow keys and selects with Enter, stripping the @query", async () => {
    const user = userEvent.setup();
    const onSelectAsset = jest.fn();
    render(<Harness onSelectAsset={onSelectAsset} />);
    const textarea = screen.getByLabelText("prompt") as HTMLTextAreaElement;

    await user.type(textarea, "hi @fo");
    await screen.findByTestId("asset-mention-menu");
    expect(screen.getByTestId("selected-index")).toHaveTextContent("0");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("selected-index")).toHaveTextContent("1");

    await user.keyboard("{Enter}");
    expect(onSelectAsset).toHaveBeenCalledWith(MOCK_ASSETS[1]);
    // The `@fo` trigger text is removed, leaving just what preceded it.
    await waitFor(() => expect(textarea.value).toBe("hi "));
    expect(screen.queryByTestId("asset-mention-menu")).not.toBeInTheDocument();
  });

  it("selects on tile click", async () => {
    const user = userEvent.setup();
    const onSelectAsset = jest.fn();
    render(<Harness onSelectAsset={onSelectAsset} />);
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@");
    await user.click(await screen.findByTestId("tile-a1"));
    expect(onSelectAsset).toHaveBeenCalledWith(MOCK_ASSETS[0]);
  });

  it("dismisses on Escape without sending, and stays closed on the same @", async () => {
    const user = userEvent.setup();
    render(<Harness onSelectAsset={jest.fn()} />);
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@fo");
    await screen.findByTestId("asset-mention-menu");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("asset-mention-menu")).not.toBeInTheDocument()
    );

    // Typing more of the same mention keeps it dismissed.
    await user.type(textarea, "x");
    expect(screen.queryByTestId("asset-mention-menu")).not.toBeInTheDocument();
  });

  it("dismisses on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">outside</button>
        <Harness onSelectAsset={jest.fn()} />
      </>
    );
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@fo");
    await screen.findByTestId("asset-mention-menu");

    await user.click(screen.getByRole("button", { name: "outside" }));
    await waitFor(() =>
      expect(screen.queryByTestId("asset-mention-menu")).not.toBeInTheDocument()
    );
  });

  it("stays open when clicking inside the picker menu", async () => {
    const user = userEvent.setup();
    render(<Harness onSelectAsset={jest.fn()} />);
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@fo");
    const menu = await screen.findByTestId("asset-mention-menu");

    await user.click(menu);
    expect(screen.getByTestId("asset-mention-menu")).toBeInTheDocument();
  });

  it("hides entities when the host provides no onSelectEntity", async () => {
    const user = userEvent.setup();
    render(<Harness onSelectAsset={jest.fn()} />);

    await user.type(screen.getByLabelText("prompt"), "@");
    await screen.findByTestId("asset-mention-menu");
    expect(screen.queryByTestId("entity-tile-e1")).not.toBeInTheDocument();
  });

  it("selecting an entity inlines its name in place of the @query", async () => {
    const user = userEvent.setup();
    const onSelectAsset = jest.fn();
    const onSelectEntity = jest.fn();
    render(
      <Harness onSelectAsset={onSelectAsset} onSelectEntity={onSelectEntity} />
    );
    const textarea = screen.getByLabelText("prompt") as HTMLTextAreaElement;

    await user.type(textarea, "hi @mar");
    await screen.findByTestId("asset-mention-menu");

    // Entities come first in the combined order, so Enter picks Marta.
    await user.keyboard("{Enter}");
    expect(onSelectEntity).toHaveBeenCalledWith(MOCK_ENTITIES[0]);
    expect(onSelectAsset).not.toHaveBeenCalled();
    await waitFor(() => expect(textarea.value).toBe("hi Marta "));
  });

  it("keyboard nav crosses from entities into assets", async () => {
    const user = userEvent.setup();
    const onSelectAsset = jest.fn();
    render(
      <Harness onSelectAsset={onSelectAsset} onSelectEntity={jest.fn()} />
    );
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "@");
    await screen.findByTestId("asset-mention-menu");

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onSelectAsset).toHaveBeenCalledWith(MOCK_ASSETS[0]);
  });
});
