import { expectTypeOf, test } from "vitest";
import { run, type OutputHandle } from "../src/core.js";
import { workflow, choose, map, t, template } from "../src/authoring.js";
import { if_ } from "../src/generated/nodetool.control.js";

test("typed workflow parameters, results, and composition", () => {
  const greeting = workflow(
    { name: t.string(), count: t.int().optional(1) },
    ({ name, count }) => {
      expectTypeOf(name).toEqualTypeOf<OutputHandle<string>>();
      expectTypeOf(count).toEqualTypeOf<OutputHandle<number>>();
      return { value: template`${name} ${count}` };
    }
  );
  expectTypeOf(greeting({ name: "Ada" }).value).toEqualTypeOf<
    OutputHandle<string>
  >();
  expectTypeOf(run(greeting, { params: { name: "Ada" } })).toEqualTypeOf<
    Promise<{ value: string }>
  >();
  // @ts-expect-error execution parameters retain their schema types
  run(greeting, { params: { name: 3 } });
  // @ts-expect-error required name
  greeting({});
  // @ts-expect-error wrong parameter type
  greeting({ name: 3 });
  // @ts-expect-error unknown parameter
  greeting({ name: "Ada", extra: true });
  expectTypeOf(map([1, 2], (item) => template`${item}`)).toEqualTypeOf<
    OutputHandle<string[]>
  >();
  // @ts-expect-error branches must return compatible values
  choose(true, { then: () => "text", else: () => 3 });
  const branch = if_({ condition: true, value: "text" });
  expectTypeOf(branch.if_true).toEqualTypeOf<OutputHandle<unknown>>();
  expectTypeOf(branch.outputs.if_false).toEqualTypeOf<OutputHandle<unknown>>();
});
