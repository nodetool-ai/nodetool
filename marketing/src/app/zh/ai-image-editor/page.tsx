import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/ai-image-editor");

export default function Page() {
  return <LocalizedPage locale="zh" route="/ai-image-editor" />;
}
