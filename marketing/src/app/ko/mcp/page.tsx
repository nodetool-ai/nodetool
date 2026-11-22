import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/mcp");

export default function Page() {
  return <LocalizedPage locale="ko" route="/mcp" />;
}
