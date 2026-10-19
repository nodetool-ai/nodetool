import en from "../locales/en.json";
import de from "../locales/de.json";
import zhCN from "../locales/zh-CN.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLeaves(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(value) && !Array.isArray(value)) {
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      result.set(path, child);
    } else if (isRecord(child) || Array.isArray(child)) {
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

it.each([
  ["German", de],
  ["Chinese", zhCN]
])(
  "keeps English and %s catalog keys and interpolation names in sync",
  (_name, catalog) => {
    const english = getLeaves(en);
    const translated = getLeaves(catalog);

    expect(english.size).toBeGreaterThan(0);
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(getInterpolationNames(translated.get(key) ?? "")).toEqual(
        getInterpolationNames(englishValue)
      );
    }
  }
);
