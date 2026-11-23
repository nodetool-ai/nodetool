import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/node-based-workflows");

export default function Page() {
  return <LocalizedPage locale="ko" route="/node-based-workflows" />;
}
