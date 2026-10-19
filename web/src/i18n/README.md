# Web translations

The web app uses i18next and react-i18next. `AppThemeRoot` supplies
`TranslationProvider` to the web and Electron renderer. English (`en`) is the
default and fallback. Simplified Chinese (`zh-CN`) is available under
Settings → General → Appearance → Language. The choice persists in the existing
settings store. Missing or unsupported saved locales use English.

Add messages to [locales/en.json](locales/en.json), then add matching keys to
[locales/zh-CN.json](locales/zh-CN.json). Catalog tests check that both locales
have matching keys and interpolation names. Use semantic keys grouped by
feature. Translate complete sentences and preserve interpolation names. Pass
counts to i18next for plurals instead of joining words.

```tsx
import { useTranslation } from "react-i18next";
import { EditorButton } from "../components/ui_primitives";

const { t } = useTranslation();
return <EditorButton>{t("common.save")}</EditorButton>;
```

Translate accessible labels,
tooltips, and empty states along with visible text. Leave user content, resource
IDs, provider names, and machine-readable values intact. Avoid translating at
module scope because those strings would not update when the language changes.

Catalogs ship with the app and require no network requests. Missing Chinese
messages fall back to English. Interpolation returns plain text for React to
escape. Never insert translation output as HTML. Use `Intl.NumberFormat` and
`Intl.DateTimeFormat` with the selected locale when migrating formatted values.

Tests can wrap components in `TranslationProvider`, or supply an isolated
`createAppI18n(locale)` instance to `I18nextProvider`. The language setting is the
first translated control. Other screens still need their strings migrated.
