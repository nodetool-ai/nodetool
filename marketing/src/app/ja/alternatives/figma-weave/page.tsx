import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/alternatives/figma-weave");

export default function Page() {
  return <LocalizedPage locale="ja" route="/alternatives/figma-weave" />;
}
