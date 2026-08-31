import {
  codeSpanMention,
  remarkResourceMentions,
  splitResourceMentions
} from "../remarkResourceMentions";

interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
}

const paragraph = (children: MdastNode[]): MdastNode => ({
  type: "root",
  children: [{ type: "paragraph", children }]
});

const transform = (tree: MdastNode): MdastNode => {
  remarkResourceMentions()(tree);
  return tree;
};

describe("splitResourceMentions", () => {
  it("returns null for text with no resource URI", () => {
    expect(splitResourceMentions("just prose")).toBeNull();
  });

  it("splits a URI out of the surrounding text", () => {
    expect(splitResourceMentions("added storyboard://sb_1 to the board")).toEqual([
      { type: "text", value: "added " },
      {
        type: "link",
        url: "storyboard://sb_1",
        children: [{ type: "text", value: "sb_1" }]
      },
      { type: "text", value: " to the board" }
    ]);
  });

  it("keeps a sub-target fragment", () => {
    const parts = splitResourceMentions("see storyboard://sb_1#shot=s3 here");
    expect(parts?.[1]).toEqual({
      type: "link",
      url: "storyboard://sb_1#shot=s3",
      children: [{ type: "text", value: "sb_1#shot=s3" }]
    });
  });

  it("treats a trailing dot as sentence punctuation", () => {
    const parts = splitResourceMentions("the track is asset://a1.mp3.");
    expect(parts).toEqual([
      { type: "text", value: "the track is " },
      {
        type: "link",
        url: "asset://a1.mp3",
        children: [{ type: "text", value: "a1.mp3" }]
      },
      { type: "text", value: "." }
    ]);
  });

  it("splits every URI in the value", () => {
    const parts = splitResourceMentions("asset://a1.png and timeline://tl_7");
    expect(
      parts?.filter((part) => part.type === "link").map((part) => part.url)
    ).toEqual(["asset://a1.png", "timeline://tl_7"]);
  });

  it("ignores a scheme that is not a resource kind", () => {
    expect(splitResourceMentions("open https://nodetool.ai/docs")).toBeNull();
    expect(splitResourceMentions("a bundle://clip.mp4 ref")).toBeNull();
  });

  it("ignores a documentation placeholder", () => {
    expect(splitResourceMentions("write asset://<id>.<ext> verbatim")).toBeNull();
  });
});

describe("codeSpanMention", () => {
  it("rewrites a code span that is only a resource URI", () => {
    expect(codeSpanMention("asset://a1.mp3")).toEqual({
      type: "link",
      url: "asset://a1.mp3",
      children: [{ type: "text", value: "a1.mp3" }]
    });
  });

  it("leaves a code span carrying anything else", () => {
    expect(codeSpanMention("![clip](asset://a1.mp4)")).toBeNull();
    expect(codeSpanMention("asset://<id>.<ext>")).toBeNull();
    expect(codeSpanMention("npm run dev")).toBeNull();
  });
});

describe("remarkResourceMentions", () => {
  it("rewrites text nodes anywhere in the tree", () => {
    const tree = transform(
      paragraph([
        {
          type: "strong",
          children: [{ type: "text", value: "track storyboard://sb_1 done" }]
        }
      ])
    );
    const strong = tree.children?.[0].children?.[0];
    expect(strong?.children?.map((child) => child.type)).toEqual([
      "text",
      "link",
      "text"
    ]);
  });

  it("replaces a bare code span with a link", () => {
    const tree = transform(
      paragraph([{ type: "inlineCode", value: "asset://a1.mp3" }])
    );
    expect(tree.children?.[0].children).toEqual([
      {
        type: "link",
        url: "asset://a1.mp3",
        children: [{ type: "text", value: "a1.mp3" }]
      }
    ]);
  });

  it("leaves a fenced code block untouched", () => {
    const tree = transform({
      type: "root",
      children: [{ type: "code", value: "const uri = 'asset://a1.mp3';" }]
    });
    expect(tree.children?.[0]).toEqual({
      type: "code",
      value: "const uri = 'asset://a1.mp3';"
    });
  });

  it("does not nest a link inside an existing link", () => {
    const tree = transform(
      paragraph([
        {
          type: "link",
          url: "asset://a1.mp3",
          children: [{ type: "text", value: "asset://a1.mp3" }]
        }
      ])
    );
    expect(tree.children?.[0].children?.[0].children).toEqual([
      { type: "text", value: "asset://a1.mp3" }
    ]);
  });

  it("leaves a tree with no URIs alone", () => {
    const tree = transform(paragraph([{ type: "text", value: "nothing here" }]));
    expect(tree.children?.[0].children).toEqual([
      { type: "text", value: "nothing here" }
    ]);
  });
});
