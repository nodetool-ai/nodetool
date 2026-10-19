import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";

function appI18nOptions(locale: Locale) {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["en", "zh-CN"],
    load: "currentOnly",
    initAsync: false,
    defaultNS: "translation",
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN }
    },
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  };
}

export function createAppI18n(locale: Locale = DEFAULT_LOCALE): i18n {
  const instance = createInstance();
  // Bundled resources initialize synchronously, including offline Electron use.
  void instance.init(appI18nOptions(locale));
  return instance;
}

export function initializeDefaultAppI18n(): void {
  // Plain component tests use react-i18next's default instance without a provider.
  void createInstance()
    .use(initReactI18next)
    .init(appI18nOptions(DEFAULT_LOCALE));
}
