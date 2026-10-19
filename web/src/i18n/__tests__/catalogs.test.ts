import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLeaves(value: object, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      result.set(path, child);
    } else if (isRecord(child)) {
      for (const [childPath, childValue] of getLeaves(child, path)) {
        result.set(childPath, childValue);
      }
    }
  }
  return result;
}

function getInterpolationNames(value: string): string[] {
  return [...value.matchAll(/{{\s*-?\s*([^,\s}]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort();
}

it("keeps English and Chinese catalog keys and interpolation names in sync", () => {
  const english = getLeaves(en);
  const chinese = getLeaves(zhCN);

  expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort());
  for (const [key, englishValue] of english) {
    expect(getInterpolationNames(chinese.get(key) ?? "")).toEqual(
      getInterpolationNames(englishValue)
    );
  }
});
