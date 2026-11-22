import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/agents");

export default function Page() {
  return <LocalizedPage locale="ko" route="/agents" />;
}
