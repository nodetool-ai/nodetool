import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fi from "./locales/fi.json";
import ru from "./locales/ru.json";
import zhCN from "./locales/zh-CN.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import pl from "./locales/pl.json";
import sv from "./locales/sv.json";
import nb from "./locales/nb.json";
import nl from "./locales/nl.json";
import ko from "./locales/ko.json";
import ja from "./locales/ja.json";
import hi from "./locales/hi.json";
import { DEFAULT_LOCALE, LOCALE_OPTIONS, type Locale } from "./locales";

function appI18nOptions(locale: Locale) {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALE_OPTIONS.map(({ value }) => value),
    load: "currentOnly" as const,
    initAsync: false as const,
    defaultNS: "translation" as const,
    resources: {
      en: { translation: en },
      de: { translation: de },
      fi: { translation: fi },
      ru: { translation: ru },
      "zh-CN": { translation: zhCN },
      es: { translation: es },
      pt: { translation: pt },
      fr: { translation: fr },
      it: { translation: it },
      pl: { translation: pl },
      sv: { translation: sv },
      nb: { translation: nb },
      nl: { translation: nl },
      ko: { translation: ko },
      ja: { translation: ja },
      hi: { translation: hi }
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
