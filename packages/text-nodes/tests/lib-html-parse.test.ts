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
