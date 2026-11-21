import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/download");

export default function Page() {
  return <LocalizedPage locale="zh" route="/download" />;
}
