import { describe, expect, it } from "vitest";
import { parseChoiceCardOptions } from "../src/choice-cards.js";
import { widgetBindingProps } from "../src/widgets.js";

describe("ChoiceCards options", () => {
  it("declares operation choices as a readable binding", () => {
    expect(widgetBindingProps("ChoiceCards")).toEqual([{ prop: "optionsBinding", mode: "read" }]);
  });
  it("keeps exact labels, media identifiers and disabled choices", () => {
    const value = [{ value: "one", title: "  One  ", description: "Details", image: "asset://source", disabled: true }];
    expect(parseChoiceCardOptions(value)).toEqual(value);
  });
  it.each([undefined, {}, [{ value: "" }], [{ value: "x" }, { value: "x" }], [{ value: "x", image: 123 }], [{ value: "x", disabled: "false" }]])("fails closed on malformed choices %j", (value) => {
    expect(parseChoiceCardOptions(value)).toEqual([]);
  });
});
