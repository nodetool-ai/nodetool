import { describe, expect, it } from "vitest";
import {
  isPureSecretReferences,
  isSecretReference
} from "../src/mcp-server-config.js";

// [value, isSecretReference, isPureSecretReferences]
const cases: Array<[string, boolean, boolean]> = [
  ["", false, false],
  ["${A}", true, true],
  ["${a_1}", true, true],
  ["${_}", true, true],
  ["${1a}", false, false],
  ["${}", false, false],
  ["${A", false, false],
  ["A}", false, false],
  ["${A-B}", false, false],
  ["${é}", false, false],
  ["${A}${B}", false, true],
  ["${A}${}", false, false],
  ["$${A}", false, false],
  ["${${A}}", false, false],
  [" ${A}", false, false],
  ["${A}\n", false, false],
  ["x${A}", false, false]
];

describe("secret reference predicates", () => {
  it.each(cases)("%j", (value, single, pure) => {
    expect(isSecretReference(value)).toBe(single);
    expect(isPureSecretReferences(value)).toBe(pure);
  });
});
