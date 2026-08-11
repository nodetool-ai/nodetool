import { describe, it, expect } from "vitest";
import {
  RegexSplitNode,
  RegexValidateNode,
  PromptNode,
  SliceTextNode,
  ToStringNode,
  IndexOfTextNode
} from "../src/index.js";

// ---------------------------------------------------------------------------
// TEXT-EXTRA REGRESSION TESTS
// ---------------------------------------------------------------------------

describe("text-extra regressions", () => {
  // 1. RegexSplit maxsplit
  describe("RegexSplitNode maxsplit", () => {
    it("splits 'a-b-c-d' with maxsplit=2 into 3 pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 2 });
      const result = await node.process();
      // maxsplit=2 means 2 splits => 3 pieces, last piece gets the remainder
      expect(result.output).toEqual(["a", "b", "c-d"]);
    });

    it("splits with maxsplit=1 into 2 pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 1 });
      const result = await node.process();
      expect(result.output).toEqual(["a", "b-c-d"]);
    });

    it("splits with maxsplit=0 (unlimited) into all pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 0 });
      const result = await node.process();
      expect(result.output).toEqual(["a", "b", "c", "d"]);
    });
  });

  // 2. RegexValidate anchoring
  describe("RegexValidateNode anchoring", () => {
    it("pattern 'abc' should NOT match 'xxxabcxxx' (anchored at start)", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "xxxabcxxx", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(false);
    });

    it("pattern 'abc' should match 'abcxxx' (matches at start)", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "abcxxx", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(true);
    });

    it("pattern '^abc' should still work when already anchored", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "abcdef", pattern: "^abc" });
      const result = await node.process();
      expect(result.output).toBe(true);
    });

    it("pattern 'abc' should NOT match empty string", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(false);
    });
  });

  // 3. Prompt Jinja2 filters (formerly FormatText; identical render engine)
  describe("PromptNode Jinja2 filters", () => {
    it("applies upper filter", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "{{ name|upper }}", name: "hello" });
      const result = await node.process();
      expect(result.output).toBe("HELLO");
    });

    it("applies lower filter", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "{{ name|lower }}", name: "HELLO" });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });

    it("applies capitalize filter", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "{{ name|capitalize }}", name: "hello world" });
      const result = await node.process();
      expect(result.output).toBe("Hello world");
    });

    it("applies truncate filter", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "{{ name|truncate(3) }}", name: "hello" });
      const result = await node.process();
      expect(result.output).toBe("hel...");
    });

    it("chains multiple filters", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "{{ name|trim|upper }}", name: "  hello  " });
      const result = await node.process();
      expect(result.output).toBe("HELLO");
    });

    it("substitutes {{ var }} without a filter", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "Hello, {{ name }}!", name: "world" });
      const result = await node.process();
      expect(result.output).toBe("Hello, world!");
    });

    it("substitutes {var} short syntax", async () => {
      const node = new PromptNode();
      node.assign({ prompt: "Hi {name}, age {age}", name: "Sam", age: 42 });
      const result = await node.process();
      expect(result.output).toBe("Hi Sam, age 42");
    });

    it("preserves $-sequences in dynamic property values", async () => {
      const node = new PromptNode();
      node.assign({
        prompt: "price: {price}, code: {code}",
        price: "$100",
        code: "a$&b$$c"
      });
      const result = await node.process();
      expect(result.output).toBe("price: $100, code: a$&b$$c");
    });
  });

  // 5. Slice stop=0 means end of string
  describe("SliceTextNode stop=0", () => {
    it("stop=0 returns the full string (stop=0 means end)", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 0, stop: 0, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("hello world");
    });

    it("stop=0 with start offset returns from start to end", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 6, stop: 0, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("world");
    });

    it("normal slice with explicit stop works", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 0, stop: 5, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });
  });

  // 6. ToString mode=repr
  describe("ToStringNode mode=repr", () => {
    it("strings are JSON-quoted in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: "hello", mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe('"hello"');
    });

    it("numbers are stringified in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: 42, mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe("42");
    });

    it("objects are JSON-stringified in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: { a: 1 }, mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe('{"a":1}');
    });

    it("str mode returns plain string", async () => {
      const node = new ToStringNode();
      node.assign({ value: "hello", mode: "str" });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });
  });

  // 7. IndexOf searchFromEnd with end_index
  describe("IndexOfTextNode searchFromEnd with end_index", () => {
    it("finds last occurrence within bounded region", async () => {
      // text: "abcXdefXghiXjkl"
      //         0123456789...
      // X at positions 3, 7, 11
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghiXjkl",
        substring: "X",
        search_from_end: true,
        start_index: 0,
        end_index: 10
      });
      const result = await node.process();
      // Within [0, 10), last X is at index 7
      expect(result.output).toBe(7);
    });

    it("returns -1 when last occurrence is outside bounded region", async () => {
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghiXjkl",
        substring: "X",
        search_from_end: true,
        start_index: 8,
        end_index: 10
      });
      const result = await node.process();
      // Within [8, 10), there is no X
      expect(result.output).toBe(-1);
    });

    it("forward search respects end_index", async () => {
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghi",
        substring: "X",
        search_from_end: false,
        start_index: 0,
        end_index: 5
      });
      const result = await node.process();
      // Within [0, 5) = "abcXd", X is at index 3
      expect(result.output).toBe(3);
    });
  });
});
