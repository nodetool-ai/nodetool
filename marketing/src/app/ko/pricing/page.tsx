import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/pricing");

export default function Page() {
  return <LocalizedPage locale="ko" route="/pricing" />;
}
