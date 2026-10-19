import { createAppI18n } from "../i18n";
import { resolveLocale } from "../locales";

describe("translation resources", () => {
  it("initializes bundled English and Chinese synchronously", () => {
    expect(createAppI18n().t("common.save")).toBe("Save");
    expect(createAppI18n("zh-CN").t("common.save")).toBe("保存");
  });

  it("falls back to English when a Chinese message is missing", () => {
    const instance = createAppI18n("zh-CN");
    instance.removeResourceBundle("zh-CN", "translation");
    expect(instance.t("common.save")).toBe("Save");
  });

  it("supports interpolation and language-specific plural forms", () => {
    const instance = createAppI18n();
    instance.addResourceBundle("en", "test", {
      files_one: "{{count}} file for {{name}}",
      files_other: "{{count}} files for {{name}}"
    });
    instance.addResourceBundle("zh-CN", "test", {
      files_other: "{{name}}的 {{count}} 个文件"
    });
    // Exercise runtime catalogs without adding fixture messages to the app catalog.
    const translate = instance.getFixedT(null, "translation");
    const key = "test:files" as unknown as "common.save";
    expect(translate(key, { count: 1, name: "Ada" })).toBe("1 file for Ada");
    expect(translate(key, { count: 2, name: "Ada" })).toBe("2 files for Ada");
    void instance.changeLanguage("zh-CN");
    expect(translate(key, { count: 2, name: "Ada" })).toBe("Ada的 2 个文件");
  });

  it.each([undefined, null, "fr", "zh-TW", {}, 7])(
    "defaults unsupported persisted locale %p to English",
    (value) => expect(resolveLocale(value)).toBe("en")
  );
});
