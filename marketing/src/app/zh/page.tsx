import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("zh");

export default function Page() {
  return <LanguageOverview locale="zh" />;
}
