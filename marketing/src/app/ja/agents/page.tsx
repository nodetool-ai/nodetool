import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/agents");

export default function Page() {
  return <LocalizedPage locale="ja" route="/agents" />;
}
