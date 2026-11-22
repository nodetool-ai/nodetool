import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/download");

export default function Page() {
  return <LocalizedPage locale="ko" route="/download" />;
}
