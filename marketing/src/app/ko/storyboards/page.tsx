import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/storyboards");

export default function Page() {
  return <LocalizedPage locale="ko" route="/storyboards" />;
}
