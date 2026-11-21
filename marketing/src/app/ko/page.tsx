import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("ko");

export default function Page() {
  return <LanguageOverview locale="ko" />;
}
