import LanguageOverview, { languageMetadata } from "../../components/LanguageOverview";

export const metadata = languageMetadata("es");

export default function Page() {
  return <LanguageOverview locale="es" />;
}
