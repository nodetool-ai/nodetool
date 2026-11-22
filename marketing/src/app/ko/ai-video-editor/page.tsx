import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/ai-video-editor");

export default function Page() {
  return <LocalizedPage locale="ko" route="/ai-video-editor" />;
}
