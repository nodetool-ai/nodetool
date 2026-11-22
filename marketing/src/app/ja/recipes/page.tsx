import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/recipes");

export default function Page() {
  return <LocalizedPage locale="ja" route="/recipes" />;
}
