import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/ad-library");

export default function Page() {
  return <LocalizedPage locale="ko" route="/ad-library" />;
}
