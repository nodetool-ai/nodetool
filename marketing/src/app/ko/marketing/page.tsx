import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/marketing");

export default function Page() {
  return <LocalizedPage locale="ko" route="/marketing" />;
}
