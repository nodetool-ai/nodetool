import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/SettingsStore";
import { SelectField } from "../ui_primitives";
import { LOCALE_OPTIONS, resolveLocale } from "../../i18n/locales";

export default function LanguageSetting() {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.settings.locale);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <SelectField
      label={t("language.label")}
      description={t("language.description")}
      value={locale}
      options={LOCALE_OPTIONS}
      onChange={(value) => updateSettings({ locale: resolveLocale(value) })}
    />
  );
}
