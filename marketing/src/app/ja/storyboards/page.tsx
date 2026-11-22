import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/storyboards");

export default function Page() {
  return <LocalizedPage locale="ja" route="/storyboards" />;
}
