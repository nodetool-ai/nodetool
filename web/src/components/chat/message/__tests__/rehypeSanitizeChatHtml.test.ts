import { sanitizeChatHtmlTree } from "../rehypeSanitizeChatHtml";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const el = (
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = []
): HastNode => ({ type: "element", tagName, properties, children });

const text = (value: string): HastNode => ({ type: "text", value });

const sanitize = (...children: HastNode[]): HastNode[] => {
  const tree: HastNode = { type: "root", children };
  sanitizeChatHtmlTree(tree);
  return tree.children ?? [];
};

describe("sanitizeChatHtmlTree", () => {
  it("removes script, style and iframe elements with their content", () => {
    const result = sanitize(
      el("script", {}, [text("alert(1)")]),
      el("style", {}, [text("body{display:none}")]),
      el("iframe", { srcDoc: "<script>parent.alert(1)</script>" }),
      el("p", {}, [text("kept")])
    );
    expect(result).toEqual([el("p", {}, [text("kept")])]);
  });

  it("drops event handlers and inline styles but keeps plain attributes", () => {
    const [img] = sanitize(
      el("img", {
        src: "https://example.com/a.png",
        alt: "a",
        onError: "alert(1)",
        style: "position:fixed"
      })
    );
    expect(img.properties).toEqual({
      src: "https://example.com/a.png",
      alt: "a"
    });
  });

  it("keeps formatting HTML such as details and line breaks", () => {
    const details = el("details", { open: true }, [
      el("summary", {}, [text("More")]),
      text("body"),
      el("br")
    ]);
    expect(sanitize(details)).toEqual([details]);
  });

  it("unwraps unknown elements and keeps their text", () => {
    expect(sanitize(el("marquee", {}, [text("hello")]))).toEqual([
      text("hello")
    ]);
  });

  it("keeps a task-list checkbox only, and always disabled", () => {
    const result = sanitize(
      el("input", { type: "checkbox", checked: true }),
      el("input", { type: "text", value: "x" })
    );
    expect(result).toEqual([
      el("input", { type: "checkbox", checked: true, disabled: true })
    ]);
  });

  it("keeps footnote ids and drops any other id", () => {
    const result = sanitize(
      el("li", { id: "user-content-fn-1" }),
      el("div", { id: "currentUser" })
    );
    expect(result).toEqual([el("li", { id: "user-content-fn-1" }), el("div")]);
  });

  it("sanitizes nested content", () => {
    const result = sanitize(
      el("blockquote", {}, [el("a", { href: "#", onClick: "x" }, [text("go")])])
    );
    expect(result).toEqual([
      el("blockquote", {}, [el("a", { href: "#" }, [text("go")])])
    ]);
  });
});
