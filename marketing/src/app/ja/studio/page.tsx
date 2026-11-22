import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/studio");

export default function Page() {
  return <LocalizedPage locale="ja" route="/studio" />;
}
