import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/recipes");

export default function Page() {
  return <LocalizedPage locale="ko" route="/recipes" />;
}
