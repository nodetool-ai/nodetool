import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("hi");

export default function Page() {
  return <LanguageOverview locale="hi" />;
}
