import { useEffect, useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { useSettingsStore } from "../stores/SettingsStore";
import { createAppI18n } from "../i18n/i18n";
import { resolveLocale } from "../i18n/locales";

interface TranslationProviderProps {
  children?: ReactNode;
}

export default function TranslationProvider({ children }: TranslationProviderProps) {
  const locale = useSettingsStore((state) => resolveLocale(state.settings.locale));
  const instance = useMemo(() => createAppI18n(locale), [locale]);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
