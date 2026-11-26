import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/demo");

export default function Page() {
  return <LocalizedPage locale="ja" route="/demo" />;
}
