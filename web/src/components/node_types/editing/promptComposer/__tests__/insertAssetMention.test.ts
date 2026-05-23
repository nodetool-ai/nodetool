import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor
} from "lexical";

import { AssetMentionNode, $createAssetMentionNode } from "../AssetMentionNode";
import { VariableNode } from "../VariableNode";
import { $insertAssetMention, $serializePrompt } from "../promptEditorState";

const makeEditor = () =>
  createEditor({
    namespace: "test",
    nodes: [AssetMentionNode, VariableNode],
    onError: (e) => {
      throw e;
    }
  });

/** Run an update synchronously and read back the serialized prompt. */
const serializeAfter = (
  build: () => void
): Promise<string> =>
  new Promise((resolve) => {
    const editor = makeEditor();
    editor.update(build, {
      onUpdate: () => {
        resolve(editor.getEditorState().read(() => $serializePrompt()));
      }
    });
  });

describe("$insertAssetMention", () => {
  it("pads a URN dropped into the middle of a word", async () => {
    const out = await serializeAfter(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      const text = $createTextNode("foobar");
      p.append(text);
      root.append(p);
      text.select(3, 3);
      $insertAssetMention($createAssetMentionNode("asset://abc.png", "abc"));
    });
    expect(out).toBe("foo asset://abc.png bar");
  });

  it("adds no leading space at the start of a line", async () => {
    const out = await serializeAfter(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      root.append(p);
      p.select();
      $insertAssetMention($createAssetMentionNode("asset://abc.png", "abc"));
    });
    expect(out).toBe("asset://abc.png ");
  });

  it("does not double an existing trailing space", async () => {
    const out = await serializeAfter(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      const text = $createTextNode("see  rest");
      p.append(text);
      root.append(p);
      text.select(4, 4); // caret between the two spaces of "see  rest"
      $insertAssetMention($createAssetMentionNode("asset://abc.png", "abc"));
    });
    expect(out).toBe("see asset://abc.png rest");
  });

  it("keeps consecutive mentions space-separated", async () => {
    const out = await serializeAfter(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      root.append(p);
      p.select();
      $insertAssetMention($createAssetMentionNode("asset://a.png", "a"));
      $insertAssetMention($createAssetMentionNode("asset://b.png", "b"));
    });
    expect(out).toBe("asset://a.png asset://b.png ");
  });
});
