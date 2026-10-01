import { expectTypeOf, test } from "vitest";
import type { Connectable, DslNode } from "../src/core.js";
import { string } from "../src/generated/nodetool.constant.js";
import { loadTextFolder } from "../src/generated/nodetool.text.js";

test("only a single compatible output connects implicitly", () => {
  expectTypeOf<ReturnType<typeof string>>().toExtend<Connectable<string>>();
  expectTypeOf<ReturnType<typeof string>>().not.toExtend<Connectable<number>>();
  expectTypeOf<ReturnType<typeof loadTextFolder>>().not.toExtend<
    Connectable<string>
  >();
  expectTypeOf<DslNode<{ a: string; b: string }, "a">>().not.toExtend<
    Connectable<string>
  >();
});
