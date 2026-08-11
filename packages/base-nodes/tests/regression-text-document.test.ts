import { describe, it, expect } from "vitest";
import { PromptNode } from "../src/index.js";

// ---------------------------------------------------------------------------
// TEXT-EXTRA REGRESSION TESTS
// ---------------------------------------------------------------------------

describe("text-extra regressions", () => {
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

});
