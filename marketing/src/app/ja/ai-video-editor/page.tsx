import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/ai-video-editor");

export default function Page() {
  return <LocalizedPage locale="ja" route="/ai-video-editor" />;
}
