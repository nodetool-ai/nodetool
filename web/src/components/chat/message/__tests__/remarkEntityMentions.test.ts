import {
  remarkEntityMentions,
  splitEntityMentions
} from "../remarkEntityMentions";

interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
}

const paragraph = (value: string): MdastNode => ({
  type: "root",
  children: [{ type: "paragraph", children: [{ type: "text", value }] }]
});

const transform = (tree: MdastNode): MdastNode => {
  remarkEntityMentions()(tree);
  return tree;
};

describe("splitEntityMentions", () => {
  it("returns null for text with no entity token", () => {
    expect(splitEntityMentions("just prose")).toBeNull();
  });

  it("splits a token out of the surrounding text", () => {
    expect(splitEntityMentions("a shot of entity://ent1 at dusk")).toEqual([
      { type: "text", value: "a shot of " },
      { type: "link", url: "entity://ent1", children: [{ type: "text", value: "ent1" }] },
      { type: "text", value: " at dusk" }
    ]);
  });

  it("treats a trailing dot as sentence punctuation", () => {
    expect(splitEntityMentions("meet entity://ent1.")).toEqual([
      { type: "text", value: "meet " },
      { type: "link", url: "entity://ent1", children: [{ type: "text", value: "ent1" }] },
      { type: "text", value: "." }
    ]);
  });

  it("splits every token in the value", () => {
    const parts = splitEntityMentions("entity://a and entity://b");
    expect(parts?.filter((part) => part.type === "link").map((part) => part.url)).toEqual([
      "entity://a",
      "entity://b"
    ]);
  });
});

describe("remarkEntityMentions", () => {
  it("rewrites text nodes anywhere in the tree", () => {
    const tree = transform(paragraph("with entity://ent1 here"));
    const children = tree.children?.[0].children ?? [];
    expect(children.map((child) => child.type)).toEqual(["text", "link", "text"]);
  });

  it("leaves a code span untouched", () => {
    const tree = transform({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "inlineCode", value: "entity://ent1" }]
        }
      ]
    });
    expect(tree.children?.[0].children).toEqual([
      { type: "inlineCode", value: "entity://ent1" }
    ]);
  });

  it("does not nest a link inside an existing link", () => {
    const tree = transform({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "entity://ent1",
              children: [{ type: "text", value: "entity://ent1" }]
            }
          ]
        }
      ]
    });
    const link = tree.children?.[0].children?.[0];
    expect(link?.children).toEqual([{ type: "text", value: "entity://ent1" }]);
  });

  it("leaves a tree with no tokens alone", () => {
    const tree = transform(paragraph("nothing to see"));
    expect(tree.children?.[0].children).toEqual([
      { type: "text", value: "nothing to see" }
    ]);
  });
});
