# Web translations

The web app uses i18next and react-i18next. `AppThemeRoot` supplies
`TranslationProvider` to the web and Electron renderer. English (`en`) is the
default and fallback. The language selector under Settings → General → Appearance
includes German, Finnish, Russian, Simplified Chinese, Spanish, Portuguese,
French, Italian, Polish, Swedish, Norwegian Bokmål, Dutch, Korean, Japanese,
and Hindi. The choice persists in the existing settings store. Missing or
unsupported saved locales use English.

Add messages to [locales/en.json](locales/en.json), then add matching keys to
each catalog in [locales/](locales/). Register supported languages in
[locales.ts](locales.ts) and bundle their resources in [i18n.ts](i18n.ts).
Catalog tests check that all locales have matching keys and interpolation names.
A plural message also needs every form the locale's plural rules select.
Russian and Polish add `_few` and `_many` next to `_one` and `_other`.
French, Italian, Portuguese, and Spanish also need `_many`.
The Spanish, Portuguese, French, Italian, Polish, Swedish, Norwegian Bokmål,
Dutch, Korean, Japanese, and Hindi catalogs are machine translated and need
native-speaker review for terminology and grammar.
Use semantic keys grouped by feature. Translate complete sentences and preserve
interpolation names. Pass counts to i18next for plurals instead of joining words.

```tsx
import { useTranslation } from "react-i18next";
import { EditorButton } from "../components/ui_primitives";

const { t } = useTranslation();
return <EditorButton>{t("common.save")}</EditorButton>;
```

Translate accessible labels, tooltips, and empty states along with visible text.
Leave user content, resource IDs, provider names, and machine-readable values
intact. Avoid translating at
module scope because those strings would not update when the language changes.

Catalogs ship with the app and require no network requests. Missing translated
messages fall back to English. Interpolation returns plain text for React to
escape. Never insert translation output as HTML. Use `Intl.NumberFormat` and
`Intl.DateTimeFormat` with the selected locale when migrating formatted values.

Tests can wrap components in `TranslationProvider`, or supply an isolated
`createAppI18n(locale)` instance to `I18nextProvider`.
