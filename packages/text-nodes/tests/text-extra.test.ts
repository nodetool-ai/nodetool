import { describe, expect, it } from "vitest";

import {
  HasLengthTextNode,
  SliceTextNode,
  ChunkTextNode,
  RegexReplaceNode
} from "@nodetool-ai/text-nodes";

describe("HasLengthTextNode", () => {
  it("honors min_length", async () => {
    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", min_length: 3 });
    expect((await pass.process()).output).toBe(true);

    const fail = new HasLengthTextNode();
    fail.assign({ text: "hi", min_length: 3 });
    expect((await fail.process()).output).toBe(false);
  });

  it("honors max_length", async () => {
    const fail = new HasLengthTextNode();
    fail.assign({ text: "hello", max_length: 3 });
    expect((await fail.process()).output).toBe(false);

    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", max_length: 10 });
    expect((await pass.process()).output).toBe(true);
  });

  it("honors exact_length", async () => {
    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", exact_length: 5 });
    expect((await pass.process()).output).toBe(true);

    const fail = new HasLengthTextNode();
    fail.assign({ text: "hello", exact_length: 4 });
    expect((await fail.process()).output).toBe(false);
  });

  it("passes any non-empty text when no bounds are set", async () => {
    const node = new HasLengthTextNode();
    node.assign({ text: "hello" });
    expect((await node.process()).output).toBe(true);
  });
});

describe("SliceTextNode", () => {
  it("reverses text with step=-1 and default start/stop", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "hello", step: -1 });
    expect((await node.process()).output).toBe("olleh");
  });

  it("takes every second character with step=2", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "abcdef", step: 2 });
    expect((await node.process()).output).toBe("ace");
  });

  it("reverses every second character with step=-2", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "abcdef", step: -2 });
    expect((await node.process()).output).toBe("fdb");
  });

  it("slices a range with step=1", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "hello", start: 1, stop: 4 });
    expect((await node.process()).output).toBe("ell");
  });
});

describe("ChunkTextNode", () => {
  it("rejoins chunks with the original separator", async () => {
    const node = new ChunkTextNode();
    node.assign({ text: "a,b,c,d", delimiter: ",", separator: ",", length: 2 });
    expect((await node.process()).output).toEqual(["a,b", "c,d"]);
  });
});

describe("RegexReplaceNode", () => {
  it("limits replacements via count", async () => {
    const node = new RegexReplaceNode();
    node.assign({ text: "aaa", pattern: "a", replacement: "b", count: 2 });
    expect((await node.process()).output).toBe("bba");
  });

  it("honors backreferences in the count-limited path", async () => {
    const node = new RegexReplaceNode();
    node.assign({
      text: "John Smith",
      pattern: "(\\w+) (\\w+)",
      replacement: "$2 $1",
      count: 1
    });
    expect((await node.process()).output).toBe("Smith John");
  });
});
