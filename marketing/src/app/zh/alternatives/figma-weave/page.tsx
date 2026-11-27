import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/alternatives/figma-weave");

export default function Page() {
  return <LocalizedPage locale="zh" route="/alternatives/figma-weave" />;
}
