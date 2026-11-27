import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/alternatives/flora");

export default function Page() {
  return <LocalizedPage locale="zh" route="/alternatives/flora" />;
}
