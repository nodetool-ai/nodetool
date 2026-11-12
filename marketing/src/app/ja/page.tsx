import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("ja");

export default function Page() {
  return <LanguageOverview locale="ja" />;
}
