import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/ad-library");

export default function Page() {
  return <LocalizedPage locale="ja" route="/ad-library" />;
}
