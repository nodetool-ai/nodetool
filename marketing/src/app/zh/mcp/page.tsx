import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/mcp");

export default function Page() {
  return <LocalizedPage locale="zh" route="/mcp" />;
}
