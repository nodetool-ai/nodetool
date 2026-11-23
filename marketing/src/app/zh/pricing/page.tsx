import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/pricing");

export default function Page() {
  return <LocalizedPage locale="zh" route="/pricing" />;
}
