import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/ad-library");

export default function Page() {
  return <LocalizedPage locale="zh" route="/ad-library" />;
}
