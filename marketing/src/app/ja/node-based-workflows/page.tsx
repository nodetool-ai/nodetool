import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/node-based-workflows");

export default function Page() {
  return <LocalizedPage locale="ja" route="/node-based-workflows" />;
}
