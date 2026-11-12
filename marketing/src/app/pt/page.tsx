import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("pt");

export default function Page() {
  return <LanguageOverview locale="pt" />;
}
