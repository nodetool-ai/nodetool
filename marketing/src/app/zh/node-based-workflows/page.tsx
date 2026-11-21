import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/node-based-workflows");

export default function Page() {
  return <LocalizedPage locale="zh" route="/node-based-workflows" />;
}
