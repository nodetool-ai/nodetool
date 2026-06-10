import { describe, expect, it } from "vitest";

import { ExtractLinksLibNode } from "@nodetool-ai/text-nodes";

const HTML = [
  '<a href="https://site.com/page">Page</a>',
  '<a href="/local">Local</a>',
  '<a href="https://other.com">Other</a>'
].join("");

describe("ExtractLinksLibNode", () => {
  it("classifies internal vs external links against a base URL", async () => {
    const node = new ExtractLinksLibNode();
    node.assign({ html: HTML, base_url: "https://site.com" });
    const links = (await node.process()).links as Array<{ type: string }>;
    expect(links.map((l) => l.type)).toEqual([
      "internal",
      "internal",
      "external"
    ]);
  });

  it("does not mark every link internal when base_url is empty", async () => {
    const node = new ExtractLinksLibNode();
    node.assign({ html: HTML, base_url: "" });
    const links = (await node.process()).links as Array<{ type: string }>;
    // Only root-relative links are internal without a base URL.
    expect(links.map((l) => l.type)).toEqual([
      "external",
      "internal",
      "external"
    ]);
  });
});

describe("ExtractImagesLibNode relative URLs", () => {
  it("passes relative srcs through when no base_url is set", async () => {
    const { ExtractImagesLibNode } = await import("@nodetool-ai/text-nodes");
    const node = new ExtractImagesLibNode();
    node.assign({ html: '<img src="img/cat.png">' });
    const result = await node.process();
    expect((result.images as Array<{ uri: string }>)[0].uri).toBe(
      "img/cat.png"
    );
  });
});

describe("ExtractLinksLibNode classification", () => {
  it("treats relative and same-origin links as internal", async () => {
    const { ExtractLinksLibNode } = await import("@nodetool-ai/text-nodes");
    const node = new ExtractLinksLibNode();
    node.assign({
      html:
        '<a href="page.html">a</a>' +
        '<a href="https://example.com/x">b</a>' +
        '<a href="https://other.com/x">c</a>' +
        '<a href="mailto:a@b.com">d</a>',
      base_url: "https://example.com"
    });
    const result = await node.process();
    const types = (result.links as Array<{ type: string }>).map(
      (l) => l.type
    );
    expect(types).toEqual(["internal", "internal", "external", "external"]);
  });
});
