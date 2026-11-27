import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/ai-image-editor");

export default function Page() {
  return <LocalizedPage locale="ja" route="/ai-image-editor" />;
}
