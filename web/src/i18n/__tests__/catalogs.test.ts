import en from "../locales/en.json";
import de from "../locales/de.json";
import fi from "../locales/fi.json";
import ru from "../locales/ru.json";
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

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

// Each locale needs every English key plus the plural forms its own plural
// rules select, such as `_few` and `_many` for Russian.
function getExpectedMessages(
  english: Map<string, string>,
  locale: string
): Map<string, string> {
  const categories = new Intl.PluralRules(locale).resolvedOptions()
    .pluralCategories;
  const expected = new Map(english);
  for (const [key, value] of english) {
    if (!key.endsWith("_other")) {
      continue;
    }
    const base = key.replace(PLURAL_SUFFIX, "");
    for (const category of categories) {
      if (!expected.has(`${base}_${category}`)) {
        expected.set(`${base}_${category}`, value);
      }
    }
  }
  return expected;
}

it.each([
  ["de", de],
  ["fi", fi],
  ["ru", ru],
  ["zh-CN", zhCN]
])(
  "keeps English and %s catalog keys and interpolation names in sync",
  (locale, catalog) => {
    const english = getLeaves(en);
    const expected = getExpectedMessages(english, locale);
    const translated = getLeaves(catalog);

    expect(english.size).toBeGreaterThan(0);
    expect([...translated.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [key, englishValue] of expected) {
      expect(getInterpolationNames(translated.get(key) ?? "")).toEqual(
        getInterpolationNames(englishValue)
      );
    }
  }
);
